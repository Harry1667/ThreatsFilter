// 🎯 第二道門・能力硬攔截  +  📊 第三道門・7 維規則評分
// 純規則、免費、可重算。第一道門分類完後跑這支，把該擋的擋掉、能進的打分。
import { loadConfig, loadProfile } from './config.js';

export const toNum = (v) => (v == null || v === '' || Number.isNaN(Number(v)) ? null : Number(v));

// 🎯 第二道門：回傳 {blocked, reason}。命中即不進深度 AI（省成本）。
export function gateCapability(post, cfg = loadConfig()) {
  const text = (post.text || '').toLowerCase();
  // 1) 紅線詞（釣魚/招代理/不相干）
  if (cfg.hardExcludes?.skipRedline) {
    for (const w of cfg.redlineKeywords?.list || []) {
      if (text.includes(String(w).toLowerCase())) return { blocked: 1, reason: `紅線詞:${w}` };
    }
  }
  // 2) 種類被關閉
  if (cfg.hardExcludes?.skipDisabledCategories && post.category) {
    const cat = cfg.workCategories?.[post.category];
    if (cat && cat.enabled === false) return { blocked: 1, reason: `種類已關:${post.category}` };
  }
  // 3) 技能匹配過低
  const floor = cfg.hardExcludes?.skipSkillMatchBelow;
  if (floor != null && post.skill_match != null && post.skill_match < floor) {
    return { blocked: 1, reason: `技能匹配<${floor}` };
  }
  // 4) noise（非機會）
  if (post.post_type === 'noise') return { blocked: 1, reason: '非機會' };
  return { blocked: 0, reason: '' };
}

// 發文距今幾小時（越新越好搶）
function ageHours(post) {
  if (!post.posted_at) return null;
  const t = Date.parse(post.posted_at);
  if (Number.isNaN(t)) return null;
  return (Date.now() - t) / 3600000;
}

// 📊 第三道門：7 維 → 各 0-10，加權成 total。回傳 {scores, total, verdict, reason}
export function scorePost(post, cfg = loadConfig()) {
  const C = cfg.scoring;
  const s = {};

  // 機會明確度：hiring 高、painpoint 中；文字越長越具體
  s.clarity = post.post_type === 'hiring' ? 8 : post.post_type === 'painpoint' ? 5 : 2;
  if ((post.text || '').length > 120) s.clarity = Math.min(10, s.clarity + 1);

  // 能力匹配：直接用第一道門 skill_match
  s.skill = post.skill_match != null ? post.skill_match : 5;

  // 競爭強度：回覆越多越紅海；越新越好搶
  const replies = toNum(post.replies) ?? 0;
  let comp = 9;
  if (replies >= (C.redOceanReplies || 15)) comp = 2;
  else if (replies >= 8) comp = 4;
  else if (replies >= 3) comp = 6;
  const age = ageHours(post);
  if (age != null && age <= (C.freshHours || 24)) comp = Math.min(10, comp + 1);
  s.competition = comp;

  // 作者品質：粉絲適中（真客戶），太多可能是網紅/同行廣告
  const f = toNum(post.author_followers);
  if (f == null) s.author = 5;
  else if (f < 50) s.author = 4;
  else if (f <= 5000) s.author = 8;
  else if (f <= 50000) s.author = 6;
  else s.author = 4;

  // 可成交性：hiring 像有預算；painpoint 較不確定
  s.deal = post.post_type === 'hiring' ? 7 : post.post_type === 'painpoint' ? 4 : 2;

  // 風險訊號（越高越安全）：命中可疑詞降分
  let risk = 8;
  const t = (post.text || '').toLowerCase();
  if (/(代操|包月保證|保證接案|先付訂金|加賴|加我賴|私我帶)/.test(t)) risk = 3;
  s.risk = risk;

  // 加權
  let total = 0;
  for (const [key, def] of Object.entries(C.criteria)) {
    total += (s[key] || 0) * (def.weight || 0);
  }
  total = Math.round(total / 10); // 0-100

  let verdict = 'SKIP';
  if (total >= C.threshold) verdict = 'REPLY';
  else if (total >= C.maybeThreshold) verdict = 'MAYBE';

  return { scores: s, total, verdict, reason: `競爭${s.competition}/匹配${s.skill}` };
}

// 把 score 結果攤平成 posts 欄位 patch
export function scorePatch(post, cfg = loadConfig()) {
  const gate = gateCapability(post, cfg);
  if (gate.blocked) return { blocked: 1, reason: gate.reason, verdict: 'SKIP', total_score: 0 };
  const r = scorePost(post, cfg);
  return {
    blocked: 0,
    score_clarity: r.scores.clarity,
    score_skill: r.scores.skill,
    score_competition: r.scores.competition,
    score_author: r.scores.author,
    score_deal: r.scores.deal,
    score_risk: r.scores.risk,
    total_score: r.total,
    verdict: r.verdict,
    reason: r.reason,
  };
}
