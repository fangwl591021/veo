# A-KAFFIT TEAM 商脈中心

以 `mirabeauty` 為功能基線建立的康立獨立版 LINE 會員入口，部署於 Cloudflare Workers。

## 已包含功能

- LINE Login 會員註冊與登入
- 單層推薦關係、邀請連結與分享 QR
- 點數錢包、點數明細與動態 QR
- 課程活動、實體／線上簽到
- 每日輪播觀看與簽到贈點
- 個人電子名片、名片收藏、OCR 與五大標籤分析
- 星座、生命靈數綜合內容
- CRM、點數規則、課程、媒體庫與圖文選單管理

## A-KAFFIT 環境

- Worker：`akaffit-team`
- 正式網址：`https://akaffit-team.fangwl591021.workers.dev/`
- 會員中心 LIFF ID：`2010925044-KXzQzB5r`
- 名片分享 LIFF ID：`2010925044-hPtKkoKO`
- LINE Login Channel ID：`2007221311`
- D1：`akaffit_team_crm`（建立後需將 ID 寫入 `wrangler.jsonc`）
- R2：`akaffit-team-media`

## 初始化與部署

```bash
npm ci
npx wrangler d1 create akaffit_team_crm
npx wrangler r2 bucket create akaffit-team-media
# 將 D1 database_id 填入 wrangler.jsonc
npx wrangler d1 migrations apply akaffit_team_crm --remote
npm test
npm run check
npx wrangler deploy
```

正式環境另需設定 `SESSION_SIGNING_SECRET`，並視需要設定 `ADMIN_LINE_SUBJECTS`、`WALLET_SCANNER_API_KEY`、OpenAI 與 LINE Messaging API 參數。秘密值不得提交至 GitHub。
