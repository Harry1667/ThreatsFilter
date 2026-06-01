# Threads Filter — PRD

> Upwork Filter 的 Threads 版。指紋瀏覽器爬 Threads 貼文 → AI 三道門漏斗（分類 + 種類 + 評分）→ 產出三種草稿（回覆案主 / 接案廣告 / DM）→ 人工貼上 + 學習迴圈。

參考：https://github.com/Harry1667/upworkfilter

---

## 一句話

在 Threads 上自動撈出「有人徵才/外包」與「潛在客戶痛點」的貼文，篩出適合我的、分好工作種類，並幫我寫好可直接貼上的回覆／廣告／DM 草稿。

## 核心差異（vs Upwork 版）

| 面向 | Upwork | Threads |
|---|---|---|
| 來源資料 | 結構化職缺（預算/評分/競標數） | **自由文字貼文** → 先 AI 判斷「是不是機會」 |
| 讀取 | 擴充功能爬結構化列表 | **指紋瀏覽器爬**（gstack browse）搜尋頁 |
| 客戶品質訊號 | 付款驗證/hire rate/花費 | **作者粉絲數 / 貼文互動 / 已被回覆數（紅海）/ 新鮮度** |
| 產出 | 提案投到 Upwork | **三種草稿**，人工複製貼上（零封號風險） |

## 使用者

- 一人接案開發者（全端 / AI 整合 / 自動化），Threads 台灣社群為主（中文徵才多）。
- 目標：低成本、高訊噪比地找到第一批客戶。

## 範圍（MVP）

**做：**
1. 爬文 — gstack browse 開 Threads 搜尋頁，撈貼文（文字/作者/url/時間/互動數）。
2. 第一道門・分類 — AI 便宜快篩：is_opportunity？type（hiring/painpoint/noise）+ category（工作種類）+ skill_match。
3. 第二道門・能力 — 規則硬攔截（能力圈外 / 紅線詞）→ blocked，不進深度 AI。
4. 第三道門・評分 + 分析 — 高分貼文丟 Claude 深度分析。
5. 產草稿 — 三種：回覆案主貼文 / 接案廣告貼文 / DM 開場白。
6. 工作種類篩選 — taxonomy 大類→小功能，dashboard 可依種類過濾。
7. Dashboard — 列表 / 評估 / 草稿 / 追蹤 / 設定（沿用 Upwork 版 sidebar + chat panel 風格）。
8. 學習迴圈 — Lessons / Anchors（已驗證草稿）注入未來 prompt。

**不做（MVP）：**
- 自動發文（先只產草稿，人工貼上）。
- Threads 官方 API（讀取受限，發文留待後續）。
- 多帳號 / 排程自動爬（先手動觸發）。

## 成功指標

- 每日撈 100+ 貼文，自動濾到 < 15 則「值得回」。
- 工作種類分類準確（人工抽驗一致率 > 80%）。
- 草稿可直接貼上（改動 < 20% 即送出）。

## 風險

- Threads 反爬 / 需登入 → 用指紋瀏覽器 + 已登入 session 降風險。
- 痛點貼文誤判率高 → type=painpoint 要保守，寧缺勿濫。
- 自由文字 → 分類靠 AI，需 Lessons 持續校正。
