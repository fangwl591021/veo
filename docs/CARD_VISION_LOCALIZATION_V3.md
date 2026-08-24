# A-KAFFIT Card Vision Localization V3

## 目標

名片照片只進行 **一次必要的 AI Vision 呼叫**，同時完成：

1. 名片 OCR 結構化欄位。
2. 名片在原圖中的定位。
3. 四角座標／bounding box。
4. 是否完整入鏡。
5. 缺失邊緣（left/right/top/bottom）。
6. 裁切信心。

瀏覽器拿到 AI 座標後，以 Canvas / Perspective Warp 在本機完成裁切，不再額外呼叫 AI 生成或 AI 裁圖。

## 核心成本規則

- 手機高解析照片先縮圖，再送 Vision。
- OCR + localization 必須是同一次影像 Vision 請求。
- 不允許「AI 找框一次 + AI OCR 一次」兩次付費影像呼叫。
- 主 OCR 流程不得再用第二次帶原圖的 web-search Vision 查證。
- 公開資料查核如有需要，走後續文字資料查核，不阻塞名片建立。
- V2.4 Hough / long-border / text-guided 僅保留為本機 fallback / manual hint，不是主裁切 authority。

## AI 回傳格式

`cardLocalization`：

```json
{
  "detected": true,
  "incomplete": false,
  "cropConfidence": 0.94,
  "boundingBox": {"x": 0.08, "y": 0.24, "width": 0.84, "height": 0.42},
  "corners": [
    {"x": 0.08, "y": 0.24},
    {"x": 0.92, "y": 0.25},
    {"x": 0.91, "y": 0.66},
    {"x": 0.09, "y": 0.66}
  ],
  "clippedEdges": []
}
```

座標全部使用整張輸入圖片的 0~1 正規化座標。

## 完整性規則

如果名片任一真實邊已經超出原始照片，模型必須：

- `incomplete=true`
- `clippedEdges` 指明缺少的邊，例如 `["left"]`
- 不得推算或生成不存在的邊界
- 前端直接要求使用者稍微拉遠重新拍攝

## 前端流程

```text
手機拍照 / 相簿
↓
解析度正規化（本機）
↓
一次 Vision
├─ OCR fields
└─ cardLocalization
↓
incomplete=true → 要求重拍
↓
完整且 cropConfidence 足夠
↓
本機 Perspective Warp / bounding-box crop
↓
顯示「分離後名片」+ OCR 欄位
↓
人工校正文字
↓
確認
↓
文字資料 + 裁切後圖片一起儲存
```

## 人工裁切權威

人工裁切完成後為最終裁切結果，不再重新 OCR。`x-skip-reverify: 1` 用於裁切圖片只更新影像、不重新排程 OCR。

## 驗收情境

1. 四角完整、手拿名片：OCR 正確，AI localization 正確，本機輸出只剩名片。
2. 桌面／筆電背景：背景不應進最終名片圖。
3. 斜拍：corners 透視拉正。
4. 名片左側超出照片：`incomplete=true`、`clippedEdges=["left"]`、要求重拍。
5. AI 找框信心不足：保留 OCR 文字，改人工裁切，不硬做 auto crop。
6. 人工裁切後：不產生第二次 OCR。
7. 一張正常名片：主流程只使用一次必要 Vision 影像呼叫。

## CI

V3 導入後必須同時通過 `npm test` 與 `npm run check`。Card Scanner V2.4 保留為 fallback / 診斷工具，不再代表正式主流程。
