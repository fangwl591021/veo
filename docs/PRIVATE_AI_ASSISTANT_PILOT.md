# VEO 私人 AI 助理測試

分支：`feat/private-ai-assistant-pilot`。基於 `main` 的 `534b465ce08d1c252e33ce79e59ae6bb143b9581`。

## 開啟條件與流程

只有從指定邀請入口進入，且登入身分是該邀請碼的本人，才會開啟新助理。後端以固定邀請碼 SHA-256、有效邀請紀錄、帳號狀態及 canonical owner 一起核對；前端旗標、網址或自行填寫 memberId 都不能授權。

流程為：指定 `/i/:token` → 既有邀請入口 → 登入／確認既有登入 → AI 助理。已登入的本人按下入口按鈕後，不必再做一次 LINE 登入。尚未完成會員資料者先完成原有資料流程。

新介面包含：

- AI 助理：人物在上、文字對話在下，三個人物可切換。
- 工作總覽：實際點數、近期待辦（最多 12 筆）、收藏人脈，及原功能入口。
- 原版完整總覽：保留既有頁面及功能，可返回 AI 助理。
- 聲音與人物動態可各自關閉。首次進入不自動播放；語音使用裝置中文聲音。

入口只從當次網址讀取，不從舊邀請 localStorage/sessionStorage 啟用。登入完成後以 `previewInvite` 保留本次入口；直接另開一般首頁仍走原版。重複、衝突、空白、跨站 LIFF 巢狀參數與公開分享路徑不啟用新流程。其他帳號、其他邀請碼仍走既有流程。

## 對話與任務

使用現有 AI provider router 和會員／系統金鑰設定，沒有新增金鑰或模型供應商設定。AI 未配置或失敗時，工作總覽和原功能仍可使用。

AI 回覆以純文字呈現，只能提供白名單導覽或任務草稿。任務日期與時刻必須從使用者文字確認，時區固定台北；曖昧或相互衝突的時間會補問。

使用者按「確認建立」才寫入自己的 `ai_tasks`。草稿票據有效 15 分鐘，綁定帳號、用途及內容；重送或並行確認同一票據不重複新增。確認票據只在記憶體，重新載入後須重新產生草稿。

**測試任務不發送 LINE／Telegram 通知，也不自動產生後續任務。** cron、直接推播及自動後續任務入口都排除 `task_pilot_` ID，避免只依可改變的狀態欄位判斷。任務會顯示在本人既有任務中心。

對話與人物偏好以會員分開儲存；切換人物不刪除對話。權限失效會停止語音、移除畫面並清除目前會員的測試狀態。

## API

所有 API 都要提供已驗證 session，以及 `X-Veo-Pilot-Entry` 原始邀請 token。每次重新驗證本人資格，回應皆為 `no-store`。

| 方法 | 路徑 | 用途 |
| --- | --- | --- |
| GET / POST | `/v1/assistant-pilot/access` | 核對本人及入口 |
| GET | `/v1/assistant-pilot/context` | 讀取本人摘要 |
| POST | `/v1/assistant-pilot/reply` | 文字回覆／草稿 |
| POST | `/v1/assistant-pilot/confirm` | 確認寫入測試任務 |

設定 `ASSISTANT_PILOT_ENABLED="false"` 可停止新流程；舊功能繼續使用。沒有資料庫 migration，也沒有變更正式 Worker 名稱或 bindings。

## 驗證與部署狀態

```sh
npm ci
npm run check
npm test
```

自動測試涵蓋入口與登入隔離、失效／跨帳號、台北時間、簽名草稿、防重送、通知隔離、文字注入防護、人物與頁籤切換、語音停止、確認失敗保留草稿。LinkeDOM 僅為測試依賴；產品沒有增加前端框架。

本次 261 項 Node 測試全部通過（包含 6 項 DOM 互動測試），另完成 JavaScript 語法及 Worker bundle 檢查。未呼叫真實 AI、未寫入遠端 D1、未發通知、未執行真實 LINE 登入或裝置語音驗收。開發環境的本地 Worker 啟動受 `uv_interface_addresses` 錯誤影響，無法完成瀏覽器畫面驗收；DOM 測試不等於瀏覽器視覺驗收。

**分支不是正式部署。原本的 workers.dev 連結目前不會因這個分支自動切換。** 本環境沒有 Cloudflare 部署登入。

此外，2026-09-05 讀到的正式首頁已載入 `app-20260815-132.js?v=20260905-23`、`styles.css?v=20260905-80` 及 `entry-music.js`；GitHub main 當時仍是 app `20260904-9`、styles `20260904-76`。正式版包含本分支基底尚未收錄的 `/v1/home-preview` 私人入口。本分支沒有重新實作或覆蓋該正式頁面。部署前必須先取得正式站最新程式並整合這組獨立模組，避免直接從較舊 main 部署造成回退。

部署後驗收：本人從指定入口應進入助理；同一本人另開一般首頁、其他帳號及其他邀請碼仍為原版；測試三人物、靜音／動態控制、工作總覽、原功能返回、斷線重試及重複確認。另在 LINE 內建瀏覽器與一般手機瀏覽器確認登入回跳、排版和語音。

## 人物素材

內建 image generation 工具生成寫實虛擬人物，使用於 `public/assets/assistant-pilot/{friendly,professional,energetic}.png`。各檔 2048×768，4 欄×2 列，每格 512×384。上排為閉嘴、微張、張嘴、圓嘴；下排為同嘴型加眨眼。CSS 以語音開始／結束與節奏切換幀，**屬簡易嘴型動畫，不是音素精準對嘴或即時生成影片**。

素材 prompt 共用規格：photorealistic-natural, identical centered chest-up studio portrait repeated in exactly eight equal tiles, pale lavender background, identical camera/head/clothing/lighting, change only mouth and eyelids, no text/gutters/props. 人物規格：親切型為肩長棕髮、淡紫外套；專業型為短黑髮、深藍外套；活力型為短髮、淺藍外套。素材包含於分支，沒有引用暫存路徑。
