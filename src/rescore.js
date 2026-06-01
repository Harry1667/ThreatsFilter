// 規則重算 — 改了 config 評分/種類/紅線後，對「已分類」貼文重跑第二/三道門（不重打 AI）。
import { openDb, listPosts, updatePost } from './db.js';
import { scorePatch } from './score.js';
import { loadConfig } from './config.js';

const db = openDb();
const cfg = loadConfig();
const posts = listPosts(db, { where: 'WHERE classified=1' });
for (const p of posts) updatePost(db, p.id, scorePatch(p, cfg));
console.log(`✅ 重算 ${posts.length} 則。`);
