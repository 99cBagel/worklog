# WorkLog Worker：工作結案報備

WorkLog 是工作結案報備的 pilot 試行項目。Agent 引導使用者完成兩個步驟：演示工作要求、上傳結案照片。

## 流程 1：演示

Agent 必須展示專案提供的 `Example.jpg`。圖片由專案方擁有並授權使用。

除了圖片，Agent 以 3–5 個條列重點說明工作內容、完成標準、照片應呈現的檢查重點及隱私遮蔽要求。文字須依據專案的工作要求，不自行編造。

## 流程 2：結案上傳

以簡短欄位收集：

| 欄位 | 要求 |
| --- | --- |
| 工作者電話 | 本次報備的工作者聯絡電話 |
| 案件代碼 | 本次報備的案件識別碼 |
| 合規結案照片 | 已以局部高斯模糊遮蓋隱私與個資的照片 |

照片須在上傳前完成隱私處理，保留足以判斷工作成果的內容。Agent 展示處理後的預覽，經使用者確認後提交。電話與案件代碼用於報備紀錄識別。

## AI 評估與回饋

MCP 服務端的 Cloudflare Worker 呼叫 Workers AI，讀取合規結案照片，對比示範圖片及工作要求，回傳以下三種結論之一：

| 結論 | 意義 |
| --- | --- |
| `pass` | 符合工作要求 |
| `no pass` | 未符合工作要求；列出原因及需補正項目 |
| `pending further review` | 資訊不足、照片不清或無法判定；說明需補充資料或人工覆核內容 |

回饋保持簡短，包含「結論、原因、下一步」。AI 服務失敗時須明確標示技術原因，歸入待覆核，不得視為未通過，也不得聲稱已完成影像評估。

## Pilot 範圍

本流程不引入 Bearer 或項目 API token，不要求設定相關憑證。

以上為本項目的目標流程。此文件更新不代表執行程式已完成對齊。

## 現有實作與待對齊項目

目前 v0.2.0 提供 `log_get_task`、`log_identify`、`log_prepare_upload`、`log_submit_photo`、`log_evaluate`。現有流程仍使用一小時的內部 session capability；電話仍為選填，AI 失敗狀態仍為 `manual_review`。後續程式修改須對齊上述欄位與三種結論，並保留可辨識的技術失敗原因。

現有上傳支援 JPEG／PNG，最大 4 MiB，儲存於私人 R2。R2 需要 `Example.json` 與 `Example.jpg`；缺少示範圖片時無法進行圖片對比評估。現有服務依賴上傳者聲明已完成隱私處理。

## 開發與部署

GitHub Actions 從 `main` 部署，使用 GitHub Secrets `G_Deploy2026` 與 `G_account_id`。Cloudflare Worker 名稱維持 `log-worker`，MCP 路徑為 `/mcp`。

執行 `npm run check` 進行語法及流程測試。
