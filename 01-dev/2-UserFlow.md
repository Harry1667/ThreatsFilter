# Threads Filter — User Flow

## 三道門漏斗（核心心智模型）

```
🚪 第一道門・分類      🎯 第二道門・能力        📊 第三道門・評分+AI
爬到的貼文          →   規則硬攔截           →   高分才丟 Claude
is_opportunity?         能力圈外 / 紅線詞          深度分析 + 產草稿
type + category         → blocked（不進 AI）
skill_match
```

## 端到端流程

```
①爬文 ─────────────────────────────────────────────
  gstack browse 開 Threads 搜尋頁（多組關鍵字）
  撈：貼文文字 / 作者 handle / 粉絲數 / url / 發文時間 / 讚數 / 回覆數
        │ (寫進 posts 表，去重 by url)
        ▼
②第一道門・分類（便宜 AI 批次）─────────────────────
  每則貼文：
    is_opportunity  是不是機會（否 → noise，丟棄不顯示）
    type            hiring（明確徵才/外包） | painpoint（潛在客戶痛點）
    category        工作種類（網站/App/自動化/AI/爬蟲/Bug修/電商…）
    skill_match     跟我技能 0-10
        │
        ▼
③第二道門・能力（規則，免費）─────────────────────
  能力圈外（category 不在我會的）/ 命中紅線詞 → blocked=1，跳過深度 AI
        │ (沒被擋的)
        ▼
④第三道門・評分 + 深度分析（Claude，手動觸發）──────
  7 維評分 → 高分貼文丟 Claude：
    - 機會真偽 / 接案可行性
    - 競爭強度（已被多少人回覆 = 紅海）
    - 該不該回、怎麼回
        │
        ▼
⑤產草稿（人工貼上）─────────────────────────────
  type=hiring   → 回覆案主草稿（像 cover letter，貼到該貼文下）
  type=painpoint→ 切入式回覆草稿（先共鳴痛點再帶服務）
  通用          → DM 開場白草稿 + 接案廣告貼文（自己發）
        │
        ▼
⑥追蹤 + 學習 ──────────────────────────────────
  標記：已回 / 已私訊 / 有回應 / 成交 / 無回應
  失敗寫 notes → AI 萃取 Lesson → 注入下次 prompt
  滿意的草稿 → ⭐ 標為 Anchor（few-shot 校準語氣）
```

## 頁面導覽（沿用 Upwork 版 sidebar 風格）

```
─── 機會流程 ───
① 列表（含種類過濾）
② 評估（單則貼文 7 維分 + AI 分）
③ 草稿（回覆 / 廣告 / DM 三 tab）
④ 追蹤（互動狀態 + 統計）

─── 每日 ───
🌅 今日 briefing

─── 設定 ───
🎯 能力 / 🔎 搜尋詞 / 🧩 工作種類地圖 / ⚖️ 評分

─── 學習 ───
📌 Lessons / ⭐ Anchors / 💾 備份
```

## 觸發方式（MVP，手動）

```bash
npm run scrape      # ① gstack browse 爬一輪
npm run triage      # ② 便宜 AI 分類全部 pending
npm run rescore     # ③ 規則重算
npm run web         # 開 dashboard（評估 / 產草稿都在這）
```

## 篩選工作種類（你特別要的）

- 分類在第一道門就標 `category`（大類）+ `tags`（小功能）。
- Dashboard 列表頁頂端有種類 chips，可單選/多選過濾。
- 設定頁「工作種類地圖」可開關哪些種類要看（關掉的種類直接 blocked）。
