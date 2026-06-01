// ① 爬文 — 用 gstack browse（指紋瀏覽器）開 Threads 搜尋頁，撈貼文 → posts 表
// 需先在 gstack 視窗登入 Threads。Threads DOM class 是混淆的，抽取靠「貼文連結 + 結構」啟發式，
// ⚠️ 選擇器需實機調校（見 EXTRACTOR）。
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { loadConfig } from './config.js';
import { openDb, upsertPost } from './db.js';

const BROWSE = path.join(os.homedir(), '.claude/skills/gstack/browse/dist/browse');
const BASE = 'https://www.threads.com';

function browse(args, timeout = 60000) {
  try {
    return execFileSync(BROWSE, args, { encoding: 'utf8', timeout, stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (e) {
    return ((e.stdout || '') + (e.stderr || '')).toString();
  }
}

const sleep = (s) => { try { execFileSync('sleep', [String(s)]); } catch {} };
const idOf = (url) => createHash('sha1').update(String(url)).digest('hex').slice(0, 16);

// 在頁面執行的抽取器：回傳貼文陣列 JSON。（已實機調校 2026-06）
// 策略：每個 /@handle/post/id 連結 → 往上找「同時含 <time> 且內文夠長」的容器，
//        從 <time> 取絕對/相對時間，並切掉開頭的 handle/標籤/時間 header 取乾淨內文。
const EXTRACTOR = `(() => {
  const out = [];
  const seen = new Set();
  for (const a of document.querySelectorAll('a[href*="/post/"]')) {
    const href = a.getAttribute('href') || '';
    const m = href.match(/\\/@([^/]+)\\/post\\/([^/?#]+)/);
    if (!m) continue;
    const url = location.origin + '/@' + m[1] + '/post/' + m[2];
    if (seen.has(url)) continue;
    seen.add(url);
    // 容器：往上找到含 <time> 且內文長度足夠的祖先（小容器只含 header，內文在隔壁子樹）
    let c = a, container = null;
    for (let i = 0; i < 10 && c; i++) {
      c = c.parentElement;
      if (c && c.querySelector && c.querySelector('time') && (c.innerText || '').length > 80) { container = c; break; }
    }
    if (!container) continue;
    const t = container.querySelector('time');
    const posted_at = t ? t.getAttribute('datetime') : null;
    const posted_text = t ? (t.innerText || '').trim() : '';
    let raw = (container.innerText || '').trim();
    // 切掉時間（含）之前的 header，留下純內文
    const idx = posted_text ? raw.indexOf(posted_text) : -1;
    if (idx >= 0) raw = raw.slice(idx + posted_text.length).trim();
    // 互動數：從 svg[aria-label] 往上找按鈕容器取數字（無數字=0；支援「萬」）
    const num = (label) => {
      const svg = container.querySelector('svg[aria-label="' + label + '"]');
      if (!svg) return null;
      let b = svg; for (let i = 0; i < 6 && b.parentElement; i++) { b = b.parentElement; if (b.tagName === 'A' || b.getAttribute('role') === 'button') break; }
      const mm = (b.innerText || '').trim().match(/[\\d,.]+\\s*萬?/);
      if (!mm) return 0;
      const s = mm[0].replace(/,/g, '');
      return /萬/.test(s) ? Math.round(parseFloat(s) * 10000) : (parseInt(s, 10) || 0);
    };
    out.push({ url, author_handle: m[1], text: raw.slice(0, 1500), posted_at, posted_text, likes: num('讚'), replies: num('回覆') });
  }
  return JSON.stringify(out);
})()`;

// 共用：在目前頁面捲動 N 輪、抽取、去重、寫 DB。回傳寫入筆數。
function collectCurrentPage(cfg, db, max) {
  if (/log in|account\/login/i.test(browse(['text'])) && browse(['text']).length < 1200) {
    throw new Error('gstack 未登入 Threads。請先在 gstack 視窗登入。');
  }
  const rounds = cfg.scrape?.scrollRounds || 6;
  const collected = new Map();
  for (let r = 0; r < rounds; r++) {
    let arr = [];
    try { arr = JSON.parse(browse(['js', EXTRACTOR]).trim()); } catch { arr = []; }
    for (const p of arr) {
      if (!p.url || (p.text || '').length < (cfg.scrapeTargets?.minTextLen || 12)) continue;
      collected.set(p.url, p);
    }
    browse(['scroll']);
    sleep((cfg.scrape?.delayMsBetween || 2500) / 1000);
  }
  let n = 0;
  for (const p of collected.values()) {
    upsertPost(db, {
      id: idOf(p.url), url: p.url,
      author_handle: p.author_handle || null, author: p.author_handle || null,
      text: p.text, posted_at: p.posted_at || null, posted_text: p.posted_text || null,
      likes: p.likes ?? null, replies: p.replies ?? null,
    });
    if (++n >= max) break;
  }
  return n;
}

// 搜尋一個關鍵字。預設「相關性排序」(不加 filter)，因為真案子散在數週/數月，
// filter=recent 只看最近幾小時會被內容行銷洪水淹沒。tab 設 'recent' 才用最新排序。
async function scrapeQuery(query, cfg, db) {
  const tab = cfg.scrapeTargets?.tab; // ''/undefined = 相關性；'recent' = 最新
  const url = `${BASE}/search?q=${encodeURIComponent(query)}${tab ? `&filter=${tab}` : ''}`;
  browse(['goto', url]);
  sleep(4);
  return collectCurrentPage(cfg, db, cfg.scrape?.maxPostsPerQuery || 30);
}

// 爬「為你推薦」動態消息 — 演算法已為你的帳號養出的 lead 池（你愈互動愈準）。
async function scrapeHomeFeed(cfg, db) {
  browse(['goto', BASE + '/']);
  sleep(4);
  return collectCurrentPage(cfg, db, cfg.scrape?.maxHomeFeed || 40);
}

async function main() {
  if (!existsSync(BROWSE)) throw new Error('找不到 gstack browse，請先安裝 gstack。');
  const cfg = loadConfig();
  const db = openDb();
  let total = 0;
  // ① 先爬動態消息（演算法精選）
  if (cfg.scrapeTargets?.homeFeed !== false) {
    try {
      const n = await scrapeHomeFeed(cfg, db);
      console.log(`🏠 動態消息（為你推薦）→ ${n} 則`);
      total += n;
    } catch (e) {
      console.error(`❌ 動態消息：${e.message}`);
      if (/未登入/.test(e.message)) { console.error('請先登入後再跑。'); return; }
    }
  }
  // ② 再跑關鍵字搜尋（相關性排序）
  for (const q of cfg.searchQueries || []) {
    try {
      const n = await scrapeQuery(q, cfg, db);
      console.log(`🔎 「${q}」→ ${n} 則`);
      total += n;
    } catch (e) {
      console.error(`❌ 「${q}」：${e.message}`);
      if (/未登入/.test(e.message)) break;
    }
  }
  console.log(`\n✅ 共寫入/更新 ${total} 則貼文。接著跑：npm run triage`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => { console.error(e.message); process.exit(1); });
}
