# A-KAFFIT App Notification UI

使用者端不再直接顯示瀏覽器原生 alert / confirm / prompt 樣式。

## 元件

- `appNotice(message, options)`：單按鈕通知。
- `appConfirm(message, options)`：雙按鈕確認。
- `appPrompt(message, defaultValue, options)`：輸入型提示。

## 視覺

- App 內中央圓角卡片。
- 不顯示 workers.dev hostname 或瀏覽器標題。
- 成功：微信綠 `#07c160` 圓形勾勾。
- 錯誤：紅色提示。
- 警告／確認：黃色提示。
- 半透明遮罩與輕微背景模糊。
- iOS / Android / LIFF / 一般瀏覽器共用同一套 UI。

## 相容策略

既有 `alert()` 由 `window.alert` 全域導向 `appNotice()`，避免逐一修改業務流程。

原生 `confirm()` / `prompt()` 因需要同步回傳，無法安全 monkey patch，因此主程式已改為 async `appConfirm()` / `appPrompt()`。

目前使用者端主 bundle 不再保留原生 `confirm()` 或 `prompt()` 呼叫。
