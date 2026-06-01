// Dashboard — 原生 HTTP server，列表（種類過濾）/ 評估 / 產草稿 / 追蹤。
// MVP：單檔內嵌 HTML。沿用 Upwork 版的 sidebar 心智模型，但精簡。
import http from 'node:http';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { openDb, listPosts, getPost, updatePost, addInteraction, interactionStats } from './db.js';
import { loadConfig, enabledCategories } from './config.js';
import { makeDrafts } from './draft.js';
import { loadPortfolio, savePortfolio, makePost, classify } from './content.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ENV = path.join(__dirname, '..', '.env');
if (existsSync(ENV)) { try { process.loadEnvFile(ENV); } catch {} }
const PORT = process.env.WEB_PORT || 3013;

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function layout(title, body) {
  return `<!doctype html><html lang="zh-Hant"><head><meta charset="utf8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)} · Threads Filter</title>
<style>
*{box-sizing:border-box} body{margin:0;font:15px/1.6 -apple-system,"PingFang TC",sans-serif;color:#1a1a1a;background:#f6f7f9}
.wrap{display:grid;grid-template-columns:180px 1fr;min-height:100vh}
nav{background:#15181d;color:#cbd2da;padding:16px 12px} nav h1{font-size:15px;color:#fff;margin:0 0 14px}
nav a{display:block;color:#cbd2da;text-decoration:none;padding:6px 8px;border-radius:6px;font-size:14px}
nav a:hover{background:#222831;color:#fff} nav .sec{font-size:11px;color:#6b7480;margin:14px 0 4px;letter-spacing:1px}
main{padding:22px 28px;max-width:1000px}
.chip{display:inline-block;padding:3px 10px;border:1px solid #d0d5dd;border-radius:14px;font-size:13px;margin:0 6px 6px 0;text-decoration:none;color:#344}
.chip.on{background:#1a73e8;color:#fff;border-color:#1a73e8}
.card{background:#fff;border:1px solid #e6e8eb;border-radius:10px;padding:14px 16px;margin-bottom:12px}
.card h3{margin:0 0 4px;font-size:15px} .meta{color:#667;font-size:13px}
.badge{display:inline-block;padding:1px 8px;border-radius:10px;font-size:12px;font-weight:600}
.b-reply{background:#e6f4ea;color:#137333} .b-maybe{background:#fef7e0;color:#b06000} .b-skip{background:#f1f3f4;color:#5f6368}
.b-hiring{background:#e8f0fe;color:#1967d2} .b-painpoint{background:#fce8e6;color:#c5221f}
.score{font-weight:700;font-size:18px} a.btn{display:inline-block;background:#1a73e8;color:#fff;padding:7px 14px;border-radius:7px;text-decoration:none;font-size:14px;border:0;cursor:pointer}
textarea{width:100%;min-height:90px;border:1px solid #d0d5dd;border-radius:8px;padding:10px;font:14px/1.5 inherit}
.draft{margin:10px 0} .draft label{font-weight:600;font-size:13px;color:#445}
table{border-collapse:collapse;width:100%} td,th{border-bottom:1px solid #eee;padding:6px 8px;text-align:left;font-size:14px}
</style></head><body><div class="wrap">
<nav><h1>🧵 Threads Filter</h1>
<div class="sec">撈案引擎</div>
<a href="/">① 列表</a><a href="/?verdict=REPLY">值得回覆</a><a href="/track">④ 追蹤</a>
<div class="sec">內容行銷</div>
<a href="/content">📣 作品 / 發文</a>
<div class="sec">設定</div><a href="/settings">🎯 種類 / 評分</a>
</nav><main>${body}</main></div></body></html>`;
}

function badge(v) {
  const m = { REPLY: 'b-reply', MAYBE: 'b-maybe', SKIP: 'b-skip' };
  return `<span class="badge ${m[v] || 'b-skip'}">${v || '?'}</span>`;
}

function listPage(q) {
  const db = openDb();
  const cfg = loadConfig();
  const cats = enabledCategories(cfg);
  const sel = q.cat || '';
  const verdict = q.verdict || '';
  const where = [];
  const args = [];
  where.push('blocked=0', "post_type!='noise'");
  if (sel) { where.push('category=?'); args.push(sel); }
  if (verdict) { where.push('verdict=?'); args.push(verdict); }
  const rows = listPosts(db, { where: 'WHERE ' + where.join(' AND '), args });

  const chips = `<a class="chip ${!sel ? 'on' : ''}" href="/${verdict ? '?verdict=' + verdict : ''}">全部</a>` +
    cats.map((c) => `<a class="chip ${sel === c ? 'on' : ''}" href="/?cat=${encodeURIComponent(c)}${verdict ? '&verdict=' + verdict : ''}">${esc(c)}</a>`).join('');

  const cards = rows.map((p) => `
    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:start">
        <div>
          <span class="badge b-${p.post_type}">${esc(p.post_type)}</span>
          <span class="chip">${esc(p.category || '?')}</span> ${badge(p.verdict)}
        </div>
        <div class="score">${p.total_score ?? '-'}</div>
      </div>
      <p style="margin:8px 0">${esc((p.text || '').slice(0, 220))}…</p>
      <div class="meta">@${esc(p.author_handle || '?')}｜回覆${p.replies ?? '?'}｜匹配${p.skill_match ?? '?'} ·
        <a href="/post?id=${p.id}">評估 / 產草稿 →</a> ·
        <a href="${esc(p.url)}" target="_blank">原貼文</a></div>
    </div>`).join('') || '<p>沒有資料。先跑 <code>npm run scrape</code> 再 <code>npm run triage</code>。</p>';

  return layout('列表', `<h2>機會列表（${rows.length}）</h2><div>${chips}</div>${cards}`);
}

async function postPage(q) {
  const db = openDb();
  const p = getPost(db, q.id);
  if (!p) return layout('找不到', '<p>找不到此貼文。</p>');
  const drafts = (p.draft_reply || p.draft_ad || p.draft_dm) ? `
    <div class="draft"><label>📩 回覆草稿</label><textarea>${esc(p.draft_reply)}</textarea></div>
    <div class="draft"><label>📣 接案廣告</label><textarea>${esc(p.draft_ad)}</textarea></div>
    <div class="draft"><label>✉️ DM 開場</label><textarea>${esc(p.draft_dm)}</textarea></div>
    <form method="post" action="/act"><input type="hidden" name="id" value="${p.id}">
      <button class="btn" name="kind" value="reply">標記已回覆</button>
      <button class="btn" name="kind" value="dm" style="background:#5f6368">標記已私訊</button></form>`
    : `<form method="post" action="/draft"><input type="hidden" name="id" value="${p.id}">
        <button class="btn">✨ 產生三種草稿</button></form>`;
  return layout('評估', `
    <p><a href="/">← 列表</a></p>
    <h2>${badge(p.verdict)} <span class="score">${p.total_score ?? '-'}</span> · ${esc(p.category)}</h2>
    <div class="card"><div class="meta">@${esc(p.author_handle)}｜粉絲${p.author_followers ?? '?'}｜回覆${p.replies ?? '?'}｜
      <a href="${esc(p.url)}" target="_blank">原貼文</a></div>
      <p>${esc(p.text)}</p></div>
    <div class="card"><b>7 維</b>：明確${p.score_clarity ?? '-'} 匹配${p.score_skill ?? '-'} 競爭${p.score_competition ?? '-'}
      作者${p.score_author ?? '-'} 成交${p.score_deal ?? '-'} 風險${p.score_risk ?? '-'}</div>
    ${drafts}`);
}

function trackPage() {
  const db = openDb();
  const st = interactionStats(db);
  const rows = db.prepare('SELECT * FROM interactions ORDER BY acted_at DESC').all();
  const body = rows.map((r) => `<tr><td>${esc(r.kind)}</td><td>${esc((r.content || '').slice(0, 60))}</td><td>${esc(r.status)}</td><td>${esc(r.acted_at?.slice(0, 16))}</td></tr>`).join('');
  return layout('追蹤', `<h2>互動追蹤</h2>
    <div class="card">總互動 ${st.total}｜回應率 ${st.responseRate}%｜成交率 ${st.winRate}%</div>
    <table><tr><th>類型</th><th>內容</th><th>狀態</th><th>時間</th></tr>${body || '<tr><td colspan=4>尚無</td></tr>'}</table>`);
}

function settingsPage() {
  const cfg = loadConfig();
  const cats = Object.entries(cfg.workCategories).filter(([k]) => !k.startsWith('_'))
    .map(([k, v]) => `<tr><td>${esc(k)}</td><td>${v.enabled ? '✅ 開' : '⬜ 關'}</td></tr>`).join('');
  return layout('設定', `<h2>工作種類</h2>
    <p class="meta">改 <code>config.json</code> 的 workCategories.enabled，存檔後跑 <code>npm run rescore</code>。</p>
    <table><tr><th>種類</th><th>狀態</th></tr>${cats}</table>
    <h2 style="margin-top:24px">評分門檻</h2>
    <div class="card">REPLY ≥ ${cfg.scoring.threshold}｜MAYBE ≥ ${cfg.scoring.maybeThreshold}｜紅海回覆數 ${cfg.scoring.redOceanReplies}</div>`);
}

// 內容行銷頁：可發作品（一鍵產貼文）+ 自用作品（折疊）
function contentPage() {
  const p = loadPortfolio();
  const all = Object.values(p.repos || {});
  if (!all.length) {
    return layout('內容行銷', `<h2>📣 作品 / 發文</h2>
      <p>還沒判斷作品。執行 <code>npm run content -- classify</code> 或按下方按鈕。</p>
      <form method="post" action="/content/classify"><button class="btn">🔍 判斷作品自用/可發</button></form>`);
  }
  const pub = all.filter((r) => r.publishable);
  const priv = all.filter((r) => !r.publishable);
  const pubCards = pub.map((r) => `
    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:start">
        <div><h3>${esc(r.name)} <span class="meta">${esc(r.language)}</span></h3>
          <div class="meta">${esc(r.desc)}</div>
          <div class="meta">切入：${esc(r.angle || '—')}</div></div>
        <form method="post" action="/content/post"><input type="hidden" name="name" value="${esc(r.name)}">
          <button class="btn">✨ 產貼文</button></form>
      </div>
      ${r.post ? `<div class="draft"><label>📣 貼文草稿（可編輯後複製）</label><textarea>${esc(r.post)}</textarea></div>` : ''}
    </div>`).join('');
  const privRows = priv.map((r) => `<tr><td>${esc(r.name)}</td><td class="meta">${esc(r.reason)}</td></tr>`).join('');
  return layout('內容行銷', `<h2>📣 作品 / 發文</h2>
    <form method="post" action="/content/classify" style="margin-bottom:12px"><button class="btn" style="background:#5f6368">🔄 重新判斷</button></form>
    <h3>📤 可發（${pub.length}）— 點「產貼文」生成吸案案例</h3>
    ${pubCards}
    <h3 style="margin-top:20px">🔒 自用（${priv.length}）— 不公開</h3>
    <p class="meta">要改判斷：編輯 <code>portfolio.json</code> 設 <code>publishable:true, manualOverride:true</code>。</p>
    <table><tr><th>作品</th><th>原因</th></tr>${privRows}</table>`);
}

function parseQuery(url) { return Object.fromEntries(new URL(url, 'http://x').searchParams); }
function readBody(req) {
  return new Promise((res) => { let b = ''; req.on('data', (c) => b += c); req.on('end', () => res(Object.fromEntries(new URLSearchParams(b)))); });
}

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x');
  const send = (html, code = 200) => { res.writeHead(code, { 'content-type': 'text/html; charset=utf8' }); res.end(html); };
  try {
    if (req.method === 'GET' && u.pathname === '/') return send(listPage(parseQuery(req.url)));
    if (req.method === 'GET' && u.pathname === '/post') return send(await postPage(parseQuery(req.url)));
    if (req.method === 'GET' && u.pathname === '/track') return send(trackPage());
    if (req.method === 'GET' && u.pathname === '/settings') return send(settingsPage());
    if (req.method === 'GET' && u.pathname === '/content') return send(contentPage());
    if (req.method === 'POST' && u.pathname === '/content/classify') {
      await classify();
      res.writeHead(302, { location: '/content' }); return res.end();
    }
    if (req.method === 'POST' && u.pathname === '/content/post') {
      const b = await readBody(req);
      const text = await makePost(b.name);
      const p = loadPortfolio();
      if (p.repos[b.name]) { p.repos[b.name].post = text; savePortfolio(p); }
      res.writeHead(302, { location: '/content' }); return res.end();
    }
    if (req.method === 'POST' && u.pathname === '/draft') {
      const b = await readBody(req);
      const db = openDb();
      const post = getPost(db, b.id);
      const d = await makeDrafts(post);
      updatePost(db, b.id, { draft_reply: d.reply, draft_ad: d.ad, draft_dm: d.dm });
      res.writeHead(302, { location: '/post?id=' + b.id }); return res.end();
    }
    if (req.method === 'POST' && u.pathname === '/act') {
      const b = await readBody(req);
      const db = openDb();
      const post = getPost(db, b.id);
      addInteraction(db, { post_id: b.id, kind: b.kind, content: b.kind === 'dm' ? post.draft_dm : post.draft_reply });
      updatePost(db, b.id, { status: b.kind === 'dm' ? 'dmed' : 'replied' });
      res.writeHead(302, { location: '/post?id=' + b.id }); return res.end();
    }
    send('<h1>404</h1>', 404);
  } catch (e) {
    send('<pre>' + esc(e.stack || e.message) + '</pre>', 500);
  }
});

server.listen(PORT, () => console.log(`🧵 Dashboard → http://localhost:${PORT}`));
