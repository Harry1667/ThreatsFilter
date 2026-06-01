# Threads Filter — Tech Stack

## 沿用 Upwork 版

- **Runtime**：Node.js（無框架）+ `node:sqlite`（WAL）。
- **AI**：Claude / OpenAI / Gemini，走統一 proxy（proxycli / aiproxy）。
- **漏斗成本控制**：規則（免費）→ 快篩（openai/low，自動）→ 大分析（claude，手動）。
- **Dashboard**：原生 HTTP server + 內嵌 HTML，CSS Grid 左 sidebar + IDE 風格右 chat panel。

## Threads 專屬

- **爬蟲**：gstack browse（指紋瀏覽器 / playwright stealth）開 Threads 搜尋頁，已登入 session。
  - 不用官方 API 讀取（搜尋/讀他人貼文受限）。
  - 取代 Upwork 的瀏覽器擴充 webhook。
- **發文**：MVP 只產草稿，人工貼上（無自動發布、零封號風險）。

## 目錄結構

```
threatsfilter/
├─ package.json
├─ config.json            搜尋詞 / 工作種類 / 技能 / 評分權重
├─ profile.json           我的接案檔案（草稿 prompt 注入）
├─ .env.example           AI proxy 金鑰 / INGEST_KEY
├─ posts.db               sqlite（gitignore）
├─ src/
│  ├─ scrape.js           gstack browse 爬 Threads 搜尋頁 → posts 表
│  ├─ classify.js         🚪 第一道門：is_opportunity + type + category + skill_match
│  ├─ score.js            🎯 第二道門能力硬攔截 + 📊 第三道門 7 維規則評分
│  ├─ triage.js           便宜 AI 批次快篩（重排序 + ai_score）
│  ├─ analyze.js          Claude 深度分析 + askAI 共用（opts.provider 切換）
│  ├─ draft.js            產草稿：回覆 / 接案廣告 / DM 三種
│  ├─ verify.js           幻覺偵測 / citation / skeptic / preflight（沿用）
│  ├─ taxonomy.js         工作種類地圖（大類→小功能）
│  ├─ db.js               node:sqlite，posts / drafts / interactions / lessons / anchors
│  ├─ tools.js            chat agent tool-use（沿用）
│  └─ web.js              HTTP server + 頁面 + API + sidebar/chat
└─ 01-dev/                計畫文件
```

## posts 表 schema（取代 Upwork 的 jobs）

| 欄位 | 說明 |
|---|---|
| id | url 的穩定 hash |
| url / author / author_handle | 貼文與作者 |
| author_followers | 作者粉絲數（品質訊號） |
| text | 貼文全文 |
| posted_at | 發文時間（ISO） |
| likes / replies | 互動數（replies 多 = 紅海） |
| post_type | hiring / painpoint / noise |
| category / tags | 工作種類（大類 / 小功能逗號分隔） |
| matched_skills | 命中的我會的技能 |
| score_* / total_score | 7 維規則分 |
| ai_score / ai_verdict | 便宜 AI / Claude 判斷 |
| blocked | 第二道門硬攔截旗標 |
| draft_reply / draft_ad / draft_dm | 三種草稿 |
| status | new / replied / dmed / responded / won / dead |
| first_seen / last_seen | 去重時間戳 |

## 7 維評分（Threads 化，取代 Upwork 維度）

| 維度 | 權重 | 看什麼 |
|---|---|---|
| 機會明確度 | 20 | 是不是真的在找人 / 需求清不清楚 |
| 能力匹配 | 25 | 種類 + 技能 vs 我會的 |
| 競爭強度 | 20 | 已被回覆數（多 = 紅海）/ 發文多久（越新越好搶） |
| 作者品質 | 15 | 粉絲數 / 看起來是真客戶還是同行 |
| 可成交性 | 10 | 像有預算的客戶 / 還是只是抱怨 |
| 風險訊號 | 10 | 釣魚 / 招代理 / 多層轉包（分數越高越安全） |

## 環境

- 開發：Mac。部署：Oracle（鳳凰城）+ aaPanel + Nginx + pm2。
- 線上沿用 hdw-auth 共用驗證；`/api/ingest` 用 `INGEST_KEY`。

## 約定（沿用全域）

- 註解繁體中文；async/await；錯誤明確不 silent fail。
- 改 schema/評分/種類後重算：`npm run rescore`。
- zsh echo 含中文括號會出錯，寫 node 指令時避免。
