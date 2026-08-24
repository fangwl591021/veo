# Android LIFF 拍照入口驗收

主會員 LIFF URL：`https://liff.line.me/2010657278-VqB7uA2y`

Worker Endpoint URL：`https://veo.fangwl591021.workers.dev/`

## 程式內已完成

- 拍照與相簿使用不同的 file input。
- 拍照 input：`accept="image/*" capture="environment"`。
- 相簿 input：`accept="image/*"`，不含 `capture`。
- 專屬推薦網址改由主 LIFF URL 進入，舊 `/i/:token` 仍相容。
- 任務提醒改由主 LIFF URL 進入。
- 非 LIFF Browser 進入掃描頁時顯示改用 LIFF 的導引。
- 「名片收藏」與「我的名片」頁面每次完成渲染後，都以 `cloneNode(true)` 重新建立拍照與背面 input。
- 新 input 會重新指定 `accept="image/*"`、`capture="environment"`，再以 `replaceWith()` 換掉啟動時建立的舊 input。
- input 重建完成後才重新綁定既有裁切／OCR onchange；相簿 input 不重建、不加入 `capture`。
- 不使用 JavaScript `.click()` 間接觸發拍照，也不使用透明 input 覆蓋或 `getUserMedia()` 頁內相機。
- 裁切、OCR、名片儲存與點數規則未修改。

## 合併後仍需人工確認（本 PR 不修改外部平台）

在 LINE Developers Console 確認主 LIFF App：

- LIFF ID：`2010657278-VqB7uA2y`
- Size：Full
- Endpoint URL：`https://veo.fangwl591021.workers.dev/`

將下列所有「會員中心／拍照掃描」入口改為主 LIFF URL，不可使用 Worker Endpoint URL：

- LINE 官方帳號圖文選單 URI
- Flex Message URI action
- 圖片地圖與關鍵字回覆
- 歡迎訊息
- QR Code
- 母站、官網與營運後台導流按鈕
- 舊教學、書籤與桌面捷徑

公開名片 `/c/:id`、公開收藏名片 `/d/:token` 維持免登入 Endpoint URL，不強制改為會員 LIFF。

## 本次實機失敗的補充根因

只確認 LIFF URL 與 `capture="environment"` 仍不足。Android LINE WebView 可能保留 SPA 啟動時對隱藏 file input 的一般上傳判定；因此必須在名片頁已顯示、使用者點擊前重建 input。Endpoint 已正確時，不應把此現象再次歸因於 LINE Developers 設定。

## Android 實機

1. 將 `https://liff.line.me/2010657278-VqB7uA2y?camera_probe=20260813` 貼到 LINE 聊天室。
2. 從聊天室點開，確認無 LINE 內建瀏覽器底部工具列。
3. 確認 `liff.isInClient() === true`。
4. 名片收藏與電子名片各測一次：拍照開相機、相簿開相簿、裁切與 OCR 正常。
5. 再從正式圖文選單重測。
6. iOS 使用同一 LIFF URL 回歸拍照、相簿、裁切與 OCR。
