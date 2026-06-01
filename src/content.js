// 內容行銷引擎 — 從 GitHub 作品產「吸案貼文」。
// 兩步：① classify 判斷每個 repo「自用 vs 可發」② post 從可發的產案例貼文。
// 結果存 portfolio.json（可手動覆寫 publishable，AI 不會蓋掉你的決定）。
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { askAI, parseJSON } from './analyze.js';
import { loadProfile } from './config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const PORTFOLIO = path.join(ROOT, 'portfolio.json');
const GH_USER = process.env.GH_USER || 'Harry1667';

const TRIAGE = { provider: process.env.AI_TRIAGE_PROVIDER || 'openai', tier: process.env.AI_TRIAGE_TIER || 'low' };
const DEEP = { provider: process.env.AI_PROXY_PROVIDER || 'claude', tier: process.env.AI_PROXY_TIER || 'high' };

// 抓 GitHub repos（名稱/語言/描述）
function fetchRepos() {
  const raw = execFileSync('gh', ['api', `users/${GH_USER}/repos?per_page=100&sort=pushed`], { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
  return JSON.parse(raw).map((r) => ({ name: r.name, language: r.language || '', desc: r.description || '' }));
}

function loadPortfolio() {
  if (existsSync(PORTFOLIO)) { try { return JSON.parse(readFileSync(PORTFOLIO, 'utf8')); } catch { /* */ } }
  return { updatedAt: null, repos: {} };
}
function savePortfolio(p) {
  p.updatedAt = new Date().toISOString();
  writeFileSync(PORTFOLIO, JSON.stringify(p, null, 2));
}

// ① 判斷「自用 vs 可發」。回傳每個 repo: {publishable, reason, angle}
async function classify() {
  const repos = fetchRepos();
  const blocks = repos.map((r, i) => `${i + 1}. ${r.name}（${r.language}）：${r.desc || '(無描述)'}`).join('\n');
  const prompt = `你是接案者的個人品牌顧問。下面是接案者的 GitHub repos。判斷每個適不適合拿來「在社群發案例貼文吸引客戶」。

判斷標準：
- 可發(publishable=true)：面向真實使用者的完整產品、有痛點/成果故事、能展示能力又不尷尬（如 AI App、自動化系統、SaaS、實用工具）。
- 自用(publishable=false)：① 你自己的開發工具(dev tool)；② 品牌站/作品集本身；③ 學術作業性質、代寫/代解類（公開宣傳有爭議）；④ 純內部專案；⑤ 無描述的 demo/半成品。

repos：
${blocks}

只回 JSON 陣列，每個 repo 一個物件：
[{"name":"repo名","publishable":true/false,"reason":"≤20字原因","angle":"若可發,一句話切入角度(痛點導向);自用則空字串"}]
只回 JSON。`;
  const arr = parseJSON(await askAI(prompt, TRIAGE)) || [];
  const p = loadPortfolio();
  for (const r of repos) {
    const j = arr.find((x) => x.name === r.name) || {};
    const prev = p.repos[r.name] || {};
    p.repos[r.name] = {
      ...r,
      // 尊重手動覆寫：portfolio.json 裡 manualOverride=true 就不被 AI 蓋
      publishable: prev.manualOverride ? prev.publishable : (j.publishable ?? false),
      reason: j.reason || prev.reason || '',
      angle: j.angle || prev.angle || '',
      manualOverride: prev.manualOverride || false,
    };
  }
  savePortfolio(p);
  return p;
}

// ② 從一個可發 repo 產吸案貼文
async function makePost(repoName) {
  const p = loadPortfolio();
  const r = p.repos[repoName];
  if (!r) throw new Error(`portfolio 沒有 ${repoName}，先跑 classify`);
  if (!r.publishable) throw new Error(`${repoName} 標為自用，不產貼文（要發請在 portfolio.json 設 publishable+manualOverride）`);
  const profile = loadProfile();
  const prompt = `你是${profile.title || '接案工作室'}。幫我把這個作品寫成一篇 Threads 吸案貼文（繁中口語、真人感、不浮誇、不業配腔）。
作品：${r.name}（${r.language}）— ${r.desc}
切入角度：${r.angle || '痛點導向'}
我的定位：${profile.positioning || ''}

結構：① 開頭用一個具體痛點/情境鉤住（不要『我做了一個…』開場）② 簡短說我怎麼解決、用到什麼（具體但不堆術語）③ 帶出成果或可幫到誰 ④ 結尾一句輕 CTA（歡迎有類似需求的人聊聊，不要硬推）。
長度 ≤220 字，可加 2-3 個 hashtag。只回貼文內文，不要解說。`;
  return (await askAI(prompt, DEEP)).trim();
}

// CLI
if (import.meta.url === `file://${process.argv[1]}`) {
  const cmd = process.argv[2];
  if (cmd === 'classify') {
    const p = await classify();
    const pub = Object.values(p.repos).filter((r) => r.publishable);
    const priv = Object.values(p.repos).filter((r) => !r.publishable);
    console.log(`\n📤 可發（${pub.length}）：`);
    for (const r of pub) console.log(`  ✅ ${r.name} — ${r.reason}｜角度：${r.angle}`);
    console.log(`\n🔒 自用（${priv.length}）：`);
    for (const r of priv) console.log(`  ⬜ ${r.name} — ${r.reason}`);
    console.log(`\n已存 portfolio.json。產貼文：npm run content -- post <repo名>`);
  } else if (cmd === 'post') {
    const name = process.argv[3];
    if (!name) { console.error('用法：npm run content -- post <repo名>'); process.exit(1); }
    console.log(await makePost(name));
  } else {
    console.error('用法：npm run content -- classify | npm run content -- post <repo名>');
  }
}

export { classify, makePost, loadPortfolio, savePortfolio };
