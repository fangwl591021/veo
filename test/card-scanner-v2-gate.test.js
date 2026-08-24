import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source=(path)=>readFileSync(new URL(`../${path}`,import.meta.url),'utf8');

test('gate opens manual crop instead of sending low-confidence original into OCR',()=>{
  const gate=source('public/card-scanner-v2-gate.js');
  assert.match(gate,/manualCrop\(file,reason\)/);
  assert.match(gate,/manualCorrection:true/);
  assert.match(gate,/normalizeWorkingSource/);
  assert.match(gate,/business-card-manual-working\.webp/);
  assert.doesNotMatch(gate,/processed=file/);
});

test('gate rejects incomplete frame before manual or OCR fallback',()=>{
  const gate=source('public/card-scanner-v2-gate.js');
  assert.match(gate,/未完整入鏡\|貼近照片邊界/);
  assert.match(gate,/CARD_RETAKE_REQUIRED/);
  assert.match(gate,/不會把這張圖送給 AI OCR/);
});

test('manual crop UI states that it is local and non-AI',()=>{
  const gate=source('public/card-scanner-v2-gate.js');
  assert.match(gate,/完全在手機本機完成，不使用 AI/);
  assert.match(gate,/確認裁切/);
});
