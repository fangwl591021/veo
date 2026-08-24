# A-KAFFIT Card Scanner 架構

目前正式主方向已由 V2 純本機自動找框，收斂為 **Vision Localization V3**。

完整主規格請見：`docs/CARD_VISION_LOCALIZATION_V3.md`

## 正式主流程

```text
手機拍照 / 相簿
↓
本機解析度正規化
↓
一次必要 AI Vision
├─ OCR 結構化欄位
├─ boundingBox / corners
├─ incomplete
├─ clippedEdges
└─ cropConfidence
↓
完整 → 本機 Canvas / Perspective Warp 分離名片
缺邊 → 要求重拍
低定位信心 → 人工裁切
↓
文字人工校正
↓
文字 + 最終裁切圖片一起儲存
```

## 成本原則

- 不再使用生成式圖片做名片修復。
- 不做「AI 找框一次 + AI OCR 一次」兩次影像呼叫。
- OCR 與名片定位必須同一個 Vision request 完成。
- V2.4 Hough / long-border / text-guided 保留為 fallback / 診斷，不是正式 auto-crop authority。
- 手工裁切完成後不再重新 OCR。

## 解析度

- 手機高解析原圖先在前端縮小。
- Working Image 長邊上限約 2200px。
- AI Vision 不需要原始 12MP / 48MP 照片。
- 最終名片圖由本機依 Vision 座標裁切／透視拉正。

## 完整性

照片缺少真實名片邊緣時，不得推算或生成不存在的內容。Vision 應回：

```json
{
  "incomplete": true,
  "clippedEdges": ["left"]
}
```

前端直接要求重新拍攝。

## 保留模組

V2 本機幾何模組繼續保留，用於：

- Scanner Lab 診斷
- 無法使用 AI localization 時的人工提示
- 未來離線能力研究

但不再阻塞或主導正式 OCR 流程。
