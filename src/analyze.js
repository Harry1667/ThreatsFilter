// AI 共用層 — askAI(prompt, opts) 透過 ProxyCLI（gRPC，proxy_sdk/proxy_call.py）取得回應。
// 沿用 Upwork 版機制：prompt 從 stdin 餵入 python helper，串流避開 server 60 秒上限。
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const ENV_PATH = path.join(ROOT, '.env');
const HELPER = path.join(__dirname, 'proxy_sdk', 'proxy_call.py');

let envLoaded = false;
function loadEnv() {
  if (!envLoaded && existsSync(ENV_PATH)) {
    try { process.loadEnvFile(ENV_PATH); } catch { /* ignore */ }
    envLoaded = true;
  }
  const token = process.env.AI_PROXY_TOKEN;
  if (!token || /在此填入/.test(token)) throw new Error('尚未設定 AI_PROXY_TOKEN（請編輯 .env）');
  if (!process.env.AI_PROXY_PROJECT) throw new Error('尚未設定 AI_PROXY_PROJECT（ProxyCLI 儀表板專案名）');
}

// 呼叫 ProxyCLI（非同步 execFile，不阻塞事件迴圈）
function callProxy(prompt, opts = {}) {
  const childEnv = { ...process.env };
  if (opts.provider) childEnv.AI_PROXY_PROVIDER = opts.provider;
  if (opts.tier) childEnv.AI_PROXY_TIER = opts.tier;
  return new Promise((resolve, reject) => {
    const child = execFile('python3', [HELPER], {
      env: childEnv, encoding: 'utf8', maxBuffer: 20 * 1024 * 1024, timeout: 200000,
    }, (err, stdout, stderr) => {
      if (err) return reject(new Error((stderr || err.message || 'ProxyCLI 呼叫失敗').toString().trim()));
      if (!stdout || !stdout.trim()) return reject(new Error('ProxyCLI 回應為空'));
      resolve(stdout);
    });
    child.stdin.write(prompt);
    child.stdin.end();
  });
}

// 共用：給 prompt → 回 AI 文字。opts.provider/opts.tier 可指定便宜模型（快篩用）。
export async function askAI(prompt, opts = {}) {
  loadEnv();
  return callProxy(prompt, opts);
}

// 容錯解析：AI 偶爾包 markdown 圍欄或夾雜文字，抓出第一個 JSON 物件
export function parseJSON(text) {
  if (!text) return null;
  let s = String(text).trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  try { return JSON.parse(s); } catch { /* 往下抓 */ }
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start >= 0 && end > start) {
    try { return JSON.parse(s.slice(start, end + 1)); } catch { /* fail */ }
  }
  return null;
}
