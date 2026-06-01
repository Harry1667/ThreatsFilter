// SQLite 資料層 — 使用 Node 內建的 node:sqlite（免裝原生套件）
// 表：posts（貼文/機會）、interactions（互動追蹤）、lessons（學習日誌）、anchors（已驗證草稿）
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, '..', 'posts.db');

const SCORE_COLS = ['score_clarity', 'score_skill', 'score_competition', 'score_author', 'score_deal', 'score_risk'];

export function openDb() {
  const db = new DatabaseSync(DB_PATH);
  // 並發：WAL 允許多讀單寫，busy_timeout 遇鎖等待而非報錯（web 與 triage 腳本同時存取）
  try { db.exec('PRAGMA journal_mode = WAL'); } catch { /* ignore */ }
  try { db.exec('PRAGMA busy_timeout = 8000'); } catch { /* ignore */ }

  db.exec(`
    CREATE TABLE IF NOT EXISTS posts (
      id                TEXT PRIMARY KEY,   -- url 的穩定 hash
      url               TEXT,
      author            TEXT,
      author_handle     TEXT,
      author_followers  INTEGER,
      text              TEXT,
      posted_at         TEXT,               -- ISO，發文絕對時間
      posted_text       TEXT,               -- 相對字串（會過期，僅備查）
      likes             INTEGER,
      replies           INTEGER,
      post_type         TEXT,               -- hiring / painpoint / noise（第一道門）
      category          TEXT,               -- 工作種類大類
      tags              TEXT,               -- 小功能，逗號分隔
      matched_skills    TEXT,
      skill_match       INTEGER,            -- 0-10（第一道門）
      score_clarity     INTEGER,
      score_skill       INTEGER,
      score_competition INTEGER,
      score_author      INTEGER,
      score_deal        INTEGER,
      score_risk        INTEGER,
      total_score       INTEGER,
      verdict           TEXT,               -- REPLY / MAYBE / SKIP
      reason            TEXT,
      ai_score          REAL,
      ai_verdict        TEXT,
      ai_analysis_json  TEXT,
      draft_reply       TEXT,
      draft_ad          TEXT,
      draft_dm          TEXT,
      blocked           INTEGER DEFAULT 0,  -- 第二道門硬攔截
      classified        INTEGER DEFAULT 0,  -- 第一道門是否跑過
      status            TEXT DEFAULT 'new', -- new/replied/dmed/responded/won/dead
      first_seen        TEXT,
      last_seen         TEXT
    );
  `);
  // 遷移：舊 DB 補欄位（忽略已存在）
  for (const col of SCORE_COLS) {
    try { db.exec(`ALTER TABLE posts ADD COLUMN ${col} INTEGER`); } catch { /* 已存在 */ }
  }

  // ── 互動追蹤（回覆 / DM 後的狀態與回應率學習）──
  db.exec(`
    CREATE TABLE IF NOT EXISTS interactions (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      post_id       TEXT,
      kind          TEXT,               -- reply / dm / ad
      content       TEXT,
      acted_at      TEXT,
      status        TEXT DEFAULT 'sent',-- sent/responded/talking/won/dead
      status_updated_at TEXT,
      notes         TEXT,
      lessons_learned TEXT
    );
  `);
  try { db.exec('CREATE INDEX IF NOT EXISTS idx_inter_post ON interactions(post_id)'); } catch {}

  // ── Lessons（學習日誌）— 抓到 AI 錯就存，自動注入未來 prompt ──
  db.exec(`
    CREATE TABLE IF NOT EXISTS lessons (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      content    TEXT NOT NULL,
      category   TEXT,
      created_at TEXT,
      enabled    INTEGER DEFAULT 1,
      hit_count  INTEGER DEFAULT 0
    );
  `);

  // ── Anchors（已驗證草稿範本）— Few-shot 注入校準語氣 ──
  db.exec(`
    CREATE TABLE IF NOT EXISTS anchors (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      kind       TEXT,                  -- reply / ad / dm
      content    TEXT,
      note       TEXT,
      created_at TEXT,
      enabled    INTEGER DEFAULT 1
    );
  `);

  return db;
}

// ── posts helpers ──
// 去重 upsert：以 id（url hash）為主鍵，重複出現只更新互動數與 last_seen
export function upsertPost(db, p) {
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO posts (
      id, url, author, author_handle, author_followers,
      text, posted_at, posted_text, likes, replies,
      first_seen, last_seen
    ) VALUES (
      $id, $url, $author, $author_handle, $author_followers,
      $text, $posted_at, $posted_text, $likes, $replies,
      $now, $now
    )
    ON CONFLICT(id) DO UPDATE SET
      likes=COALESCE($likes, likes),
      replies=COALESCE($replies, replies),
      author_followers=COALESCE($author_followers, author_followers),
      last_seen=$now
  `).run({
    $id: p.id,
    $url: p.url ?? null,
    $author: p.author ?? null,
    $author_handle: p.author_handle ?? null,
    $author_followers: p.author_followers ?? null,
    $text: p.text ?? null,
    $posted_at: p.posted_at ?? null,
    $posted_text: p.posted_text ?? null,
    $likes: p.likes ?? null,
    $replies: p.replies ?? null,
    $now: now,
  });
}

export function listPosts(db, { where = '', args = [] } = {}) {
  return db.prepare(`SELECT * FROM posts ${where} ORDER BY COALESCE(posted_at, first_seen) DESC`).all(...args);
}
export function getPost(db, id) {
  return db.prepare('SELECT * FROM posts WHERE id=?').get(id);
}
export function updatePost(db, id, patch) {
  const cols = Object.keys(patch);
  if (!cols.length) return;
  const sets = cols.map((c) => `${c}=?`).join(', ');
  db.prepare(`UPDATE posts SET ${sets} WHERE id=?`).run(...cols.map((c) => patch[c]), id);
}

// ── lessons helpers ──
export function addLesson(db, content, category = 'general') {
  return db.prepare('INSERT INTO lessons (content, category, created_at) VALUES (?, ?, ?)').run(
    String(content || '').trim().slice(0, 500), category, new Date().toISOString());
}
export function listLessons(db, onlyEnabled = false) {
  const q = onlyEnabled ? 'SELECT * FROM lessons WHERE enabled=1 ORDER BY id DESC' : 'SELECT * FROM lessons ORDER BY id DESC';
  return db.prepare(q).all();
}
export function deleteLesson(db, id) { db.prepare('DELETE FROM lessons WHERE id=?').run(id); }

// ── anchors helpers ──
export function addAnchor(db, a) {
  return db.prepare('INSERT INTO anchors (kind, content, note, created_at) VALUES (?, ?, ?, ?)').run(
    a.kind || 'reply', String(a.content || '').slice(0, 5000), a.note || '', new Date().toISOString());
}
export function listAnchors(db, kind = null) {
  if (kind) return db.prepare('SELECT * FROM anchors WHERE enabled=1 AND kind=? ORDER BY id DESC').all(kind);
  return db.prepare('SELECT * FROM anchors WHERE enabled=1 ORDER BY id DESC').all();
}
export function deleteAnchor(db, id) { db.prepare('DELETE FROM anchors WHERE id=?').run(id); }

// ── interactions helpers ──
export function addInteraction(db, it) {
  const now = new Date().toISOString();
  return db.prepare(`INSERT INTO interactions (post_id, kind, content, acted_at, status, status_updated_at, notes)
    VALUES (?, ?, ?, ?, 'sent', ?, ?)`).run(
    it.post_id, it.kind || 'reply', it.content || '', it.acted_at || now, now, it.notes || '');
}
export function listInteractions(db) {
  return db.prepare('SELECT * FROM interactions ORDER BY acted_at DESC').all();
}
export function interactionStats(db) {
  const total = db.prepare('SELECT COUNT(*) n FROM interactions').get().n || 0;
  const rows = db.prepare('SELECT status, COUNT(*) n FROM interactions GROUP BY status').all();
  const by = {};
  for (const r of rows) by[r.status] = r.n;
  const responded = (by.responded || 0) + (by.talking || 0) + (by.won || 0);
  return {
    total, by,
    responseRate: total ? (responded / total * 100).toFixed(1) : '0',
    winRate: total ? ((by.won || 0) / total * 100).toFixed(1) : '0',
  };
}
