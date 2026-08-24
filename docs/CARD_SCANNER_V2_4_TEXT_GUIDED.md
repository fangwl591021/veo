# Card Scanner V2.4 — Text-guided Candidate

狀態：實作完成，待 Preview 實拍驗證。

## 目的

V2.4 新增第三個零 token 候選來源：`text-guided-v2.4`。

它不做 OCR，不辨識文字內容，只利用名片上常見的小型高對比內容群（文字、QR、Logo 等）定位「內容大致在哪裡」，再從內容框向四邊擴張成名片候選框。

## 核心原則

1. 文字引導只做位置定位，不讀取文字內容。
2. 不呼叫 OpenAI、Gemini、OCR 或任何網路 API。
3. 仍使用 Working Image / Analysis Image 策略。
4. 文字候選不能單獨成為真相，最後仍要通過邊線、比例、完整度與表面一致性驗證。
5. 三種候選必須同時競爭，不能因前一個已找到結果就停止。

## 三路候選

### 1. `edge-hough-v2`

以 Sobel + Hough 幾何線條找四邊。

### 2. `long-border-fallback-v2.3`

找長而連續的上下／左右邊，並加入內容密度、內容貼合、表面一致性評分。

### 3. `text-guided-v2.4`

流程：

```text
Analysis Image
  ↓
局部高對比像素
  ↓
小型連通區塊
  ↓
合併成文字／QR／Logo 群
  ↓
形成 content bounding box
  ↓
依名片比例向四邊擴張
  ↓
產生多個 landscape / portrait 候選
  ↓
邊界證據 + 表面一致性 + 內容占比驗證
  ↓
候選分數
```

## Runtime 選擇方式

`card-scanner-v2-runtime.js` 現在同時計算：

- `detectCardQuad(imageData)`
- `detectLongBorderQuad(imageData)`
- `detectTextGuidedCard(imageData)`

所有非空候選都進入 `candidateScore()`，排序後選最佳候選。

Lab 會回傳：

- `candidateCount`
- 每個候選的 strategy
- confidence
- contentDensity
- contentFit
- surfaceConsistency
- edgeSupport
- coverage

## 成本

整段 V2.4 Text-guided Candidate 為 0 token。

唯一必要 AI 仍是最終 OCR，且只有通過 auto 或 manual verification 的圖片才能進入。

## 驗收重點

針對上一輪「名片放在筆電上」案例：

1. `long-border-fallback-v2.3` 不應再靠筆電／桌面大矩形直接勝出。
2. `text-guided-v2.4` 應能利用名片文字群推估更貼近名片的候選範圍。
3. 合理結果可以是：
   - auto：綠框緊貼真正名片；或
   - manual：至少不錯誤 auto。
4. 若 text-guided 仍不準，下一步只調 content clustering / expansion，不降低 OCR Gate。
