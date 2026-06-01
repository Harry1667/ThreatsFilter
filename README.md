# Threads Filter 🧵

> Upwork Filter 的 Threads 版。指紋瀏覽器爬 Threads 貼文 → **三道門漏斗**（分類 + 工作種類 + 評分）→ 產出**三種草稿**（回覆 / 接案廣告 / DM）→ 人工貼上 + 學習迴圈。
>
> 參考：https://github.com/Harry1667/upworkfilter

## 三道門漏斗

```
🚪 第一道門・分類(便宜AI)   🎯 第二道門・能力(規則)    📊 第三道門・評分+AI
is_opportunity?           紅線詞 / 種類關閉 / 匹配<3   7維規則分 → 高分丟Claude
type + category + 匹配      → blocked(不進AI)          → 產三種草稿
```

## 快速開始

```bash
npm install                      # playwright（爬蟲用）
cp .env.example .env             # 填 ProxyCLI token / 專案
cp profile.example.json profile.json   # 改成你的接案檔案

# 先在 gstack 視窗登入 Threads，然後：
npm run scrape                   # ① 爬文 → posts.db
npm run triage                   # ②③ 分類 + 評分
npm run web                      # 開 dashboard → localhost:3013
```

dashboard 內按「✨ 產生三種草稿」即產出回覆/廣告/DM，複製貼上到 Threads。

## 指令

| 指令 | 用途 |
|---|---|
| `npm run scrape` | gstack browse 爬動態消息＋相關性搜尋＋主題（含互動數） |
| `npm run triage` | 第一道門分類 + 第二/三道門評分 |
| `npm run rescore` | 改 config 後重算規則分（不重打 AI） |
| `npm run draft -- <postId>` | 單則產三種草稿（CLI） |
| `npm run content -- classify` | 判斷 GitHub repo 自用/可發 → portfolio.json |
| `npm run content -- post <repo>` | 從可發作品產吸案貼文（內容行銷引擎） |
| `npm run web` | dashboard |

## 兩種引擎

1. **撈案引擎**（scrape→triage→draft）：爬脆找網站/系統/自動化案＋痛點客戶，AI 評分排序，產回覆/廣告/DM 草稿。
2. **內容行銷引擎**（content）：判斷哪些 GitHub 作品可公開，從可發的產吸案案例貼文。

## 設定（config.json）

- `searchQueries` — Threads 搜尋關鍵字（中英混）
- `workCategories` — **工作種類**；`enabled:false` 的種類直接擋掉
- `redlineKeywords` — 紅線詞，命中即 blocked
- `mySkills` / `scoring` — 技能、7 維權重與門檻

## 架構

```
src/
├─ scrape.js    ① gstack browse 爬 Threads → posts 表  ⚠️ DOM 選擇器需實機調校
├─ classify.js  🚪 第一道門：is_opportunity + type + category + skill_match
├─ score.js     🎯 第二道門硬攔截 + 📊 第三道門 7 維評分（純規則）
├─ triage.js    漏斗執行器（批次跑 classify → score）
├─ draft.js     產三種草稿（回覆 / 廣告 / DM），注入 lessons + anchors
├─ content.js   內容行銷引擎：repo 自用/可發判斷 + 產吸案貼文
├─ analyze.js   askAI() — ProxyCLI gRPC 共用層
├─ config.js    config.json / profile.json 載入
├─ db.js        node:sqlite：posts / interactions / lessons / anchors
└─ web.js       dashboard（列表種類過濾 / 評估 / 產草稿 / 追蹤）
```

## 現況（端到端驗證可運作）

- ✅ 爬蟲：實機調校過 Threads DOM，抓動態消息＋相關性搜尋＋主題＋互動數。
- ✅ AI 漏斗：分類→攔截→評分跑通真資料（64 則→篩 10 則）。
- ✅ 產草稿：claude 產回覆/廣告/DM，繁中工作室語氣。
- ✅ 內容引擎：判斷 27 repo（15 可發 / 12 自用），產吸案貼文。
- ✅ Dashboard 可用。
- 📌 **重要心得**：脆不是 job board，徵才案散在數週/數月＋藏在「為你推薦」，必須用相關性排序＋爬動態消息，別用 filter=recent。
- 🔜 後續：自動發文（目前只產草稿，人工貼上）；定時排程爬。
