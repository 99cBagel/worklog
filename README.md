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

## 已實作流程（v0.3.0）

- `log_get_task` 回傳 MCP 圖片內容、完整圖片網址及四個工作重點；網頁表單也先展示圖片。
- `log_identify` 檢查必填電話及案件代碼；不要求登入或另行取得憑證。
- `log_prepare_upload` 提供欄位及照片處理指引。
- `log_submit_photo` 直接提交電話、案件代碼、處理後照片與預覽／同意聲明。
- `log_evaluate` 用報備收據查詢已保存的結論。

`/form` 提供兩步驟操作、裝置上的局部高斯模糊、復原及預覽確認。匯出 canvas JPEG 不保留原圖 EXIF；相容不支援 canvas filter 的瀏覽器。支援 JPEG／PNG，提交上限 4 MiB。

每次報備獨立保存，以 UUID 命名照片與紀錄，不覆蓋同電話的舊案。服務仍依賴上傳者確認隱私處理，並非自動驗證遮蔽效果。表單不會上傳原圖。

AI 以原生 Workers AI 圖片輸入分別讀取示範與結案圖，逐項判定後由程式產生三種結論。技術失敗保留可辨識原因，不假稱完成評估。模型若尚未在 Cloudflare 帳戶取得使用權限，需管理者在 Cloudflare 完成設定；程式不自動代為接受模型條款。

R2 `log-data` 必須有 `Example.json`。示範圖片先讀 `log-data/Example.jpg`，若不存在則透過 `NGO_DATA` binding 讀取原有 `ngo-data/IMG_1818.jpeg`；圖片不複製到 WorkLog GitHub repo。同步腳本檢查必要的工作標準檔案。

## 開發與部署

GitHub Actions 從 `main` 部署，使用 GitHub Secrets `G_Deploy2026` 與 `G_account_id`。Cloudflare Worker 名稱維持 `log-worker`，MCP 路徑為 `/mcp`。

執行 `npm run check` 進行語法及流程測試。
