import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const collection=readFileSync(new URL('../src/card-collection.js',import.meta.url),'utf8');
const worker=readFileSync(new URL('../src/index.js',import.meta.url),'utf8');

test('duplicate business-card image can be reprocessed instead of blocked before OCR',()=>{
  assert.match(collection,/const duplicateImage=Boolean\(previous/);
  assert.doesNotMatch(collection,/這張名片圖片已上傳過，不能重複收藏或領點/);
  assert.match(collection,/if\(!duplicateImage\)await db\.prepare\("INSERT INTO card_import_fingerprints/);
  assert.match(collection,/return \{ id, imageCount:files\.length, duplicateImage \}/);
});

test('duplicate-image retry cannot create a fresh collection reward',()=>{
  assert.match(worker,/SELECT status FROM card_import_fingerprints WHERE event_id=\?/);
  assert.match(worker,/rewardEligible=!result\.updated && rewardFingerprint\?\.status==='completed'/);
  assert.match(worker,/status:"duplicate",points:0/);
});
