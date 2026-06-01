// 設定載入層 — config.json（搜尋/種類/評分）+ profile.json（我的接案檔案）
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

export function loadConfig() {
  return JSON.parse(readFileSync(path.join(ROOT, 'config.json'), 'utf8'));
}

// profile.json 可能不存在（gitignore）→ 回退到 profile.example.json
export function loadProfile() {
  for (const f of ['profile.json', 'profile.example.json']) {
    const p = path.join(ROOT, f);
    if (existsSync(p)) {
      try { return JSON.parse(readFileSync(p, 'utf8')); } catch { /* next */ }
    }
  }
  return { name: '', title: 'Full Stack Developer', level: '新手', skills: [] };
}

// 啟用中的工作種類名稱清單（給分類器當詞彙）
export function enabledCategories(cfg = loadConfig()) {
  return Object.entries(cfg.workCategories || {})
    .filter(([k, v]) => !k.startsWith('_') && v?.enabled)
    .map(([k]) => k);
}
