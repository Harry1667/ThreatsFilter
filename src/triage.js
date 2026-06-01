// ②③ 漏斗執行器 — 對未分類貼文：第一道門分類 → 第二道門攔截 → 第三道門評分。
import { openDb, listPosts, updatePost } from './db.js';
import { classifyBatch } from './classify.js';
import { scorePatch } from './score.js';
import { loadConfig } from './config.js';

const BATCH = 8;

async function main() {
  const db = openDb();
  const cfg = loadConfig();
  const pending = listPosts(db, { where: 'WHERE classified=0' });
  if (!pending.length) { console.log('沒有待分類貼文。先跑 npm run scrape。'); return; }
  console.log(`待處理 ${pending.length} 則，每批 ${BATCH}…`);

  for (let i = 0; i < pending.length; i += BATCH) {
    const chunk = pending.slice(i, i + BATCH);
    let results = [];
    try {
      results = await classifyBatch(chunk);
    } catch (e) {
      console.error(`批 ${i / BATCH + 1} 分類失敗：${e.message}`);
      continue;
    }
    for (const r of results) {
      // 第一道門結果寫回
      updatePost(db, r.id, {
        post_type: r.post_type, category: r.category, tags: r.tags,
        skill_match: r.skill_match, classified: 1,
      });
      // 第二/三道門（需要剛寫入的分類欄位 → 重讀）
      const post = { ...chunk.find((p) => p.id === r.id), ...r };
      const patch = scorePatch(post, cfg);
      updatePost(db, r.id, patch);
    }
    console.log(`  ✓ ${Math.min(i + BATCH, pending.length)}/${pending.length}`);
  }
  const reply = listPosts(db, { where: "WHERE verdict='REPLY' AND blocked=0" }).length;
  console.log(`\n✅ 完成。值得回覆（REPLY）：${reply} 則。開 dashboard：npm run web`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => { console.error(e.message); process.exit(1); });
}
