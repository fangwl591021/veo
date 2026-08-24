import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source=readFileSync(new URL('../public/card-scanner-v2-lab.html',import.meta.url),'utf8');

test('scanner lab is local-only and never calls OCR or network APIs',()=>{
  assert.match(source,/processBusinessCardImage/);
  assert.match(source,/全程本機、0 token/);
  assert.match(source,/候選比較/);
  assert.match(source,/V2\.4 補正輸出/);
  assert.doesNotMatch(source,/fetch\(/);
  assert.doesNotMatch(source,/\/recognize/);
  assert.doesNotMatch(source,/OpenAI|Gemini|responses/i);
});

test('scanner lab surfaces auto manual and retake outcomes with four-corner diagnostics',()=>{
  assert.match(source,/自動補正成功/);
  assert.match(source,/需要人工裁切/);
  assert.match(source,/名片未完整入鏡/);
  assert.match(source,/四邊信心/);
  assert.match(source,/清晰度/);
  assert.match(source,/反光分數/);
  assert.match(source,/metadata\?\.corners/);
});
