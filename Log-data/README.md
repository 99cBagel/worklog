# Log-data

本資料夾為 WorkLog 的公開教材與空白紀錄格式，GitHub Actions 同步到 R2 `log-data`，key 不含資料夾前綴。

- 示範圖片：優先讀取 R2 `log-data/Example.jpg`；若不存在，讀取原有 R2 `ngo-data/IMG_1818.jpeg`，不複製圖片到本 repo。
- `Example.json`：四個工作重點、逐項評估標準與三種結論。
- `log-template.json`：空白格式，非真實工作紀錄。

真實電話、案件資料、結案照片與評估僅存私人 R2，不寫進 GitHub。每次報備使用獨立 UUID：`<UUID>.jpg`／`.png` 與 `<UUID>-log.json`，避免重複電話覆蓋舊案。收據僅查詢評估，不回傳電話或照片。服務未開放 R2 任意物件讀取。

`ngo-data` 是舊 NGO 專案的資料來源；WorkLog 維持使用獨立 `log-data` bucket，以唯讀 binding 存取原示範圖，不搬移或刪除舊資料。

## 正式示範圖片網址

[Example.jpg](https://log-worker.99-cent-bagel.workers.dev/example.jpg)

Agent 使用此網址展示示範圖片；AI 評估由服務端讀取同一來源。沿用既有 R2 圖片，不重新將圖片發佈至 GitHub。
