import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');

test('collection match states use clear customer-facing labels', () => {
  assert.match(source, /match\.status==="failed" \? "暫無結果"/);
  assert.match(source, /includes\(match\.status\) \? "配對中" : "待配對"/);
});

test('collection header does not show the my-card shortcut', () => {
  assert.doesNotMatch(source, /state\.tab === "cardCollection".*我的名片/);
});

test('collection polling refreshes rows without rebuilding the whole page', () => {
  assert.match(source, /cardCollection\(search,industry,true\)/);
  assert.match(source, /if\(!quiet\)\{\s*layout\(/);
});
test('collection explains the complete AI business-card CRM workflow', () => {
  assert.match(source, /AI 智慧名片 CRM/);
  assert.match(source, /從拍照開始，自動完成所有建檔/);
  for (const step of ['拍照','AI 校正圖片','OCR','AI 二次檢查','公司資料搜尋','社群資料補全','建立 CRM','建立公司知識卡','建立第一個任務']) {
    assert.match(source, new RegExp(step));
  }
  for (const field of ['官網','Google Map','Facebook','Instagram','YouTube','LinkedIn','新聞','得獎紀錄','公司介紹','Logo','地址','電話','Email','統編']) {
    assert.match(source, new RegExp(field));
  }
});
