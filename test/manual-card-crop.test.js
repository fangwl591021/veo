import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source=(path)=>readFileSync(new URL(`../${path}`,import.meta.url),'utf8');

test('card detail offers manual crop from the preserved original image',()=>{
  const app=source('public/app.js');
  assert.match(app,/data-manual-crop>手動裁切/);
  assert.match(app,/\/original-image\?v=\$\{Date\.now\(\)\}/);
  assert.match(app,/cropCollectionScanImage\(original,"正面"\)/);
  assert.match(app,/\/manual-crop/);
  assert.doesNotMatch(app,/data-retry-ai-crm/);
});

test('manual crop keeps the original R2 object and reruns OCR without a point reward',()=>{
  const collection=source('src/card-collection.js');
  const worker=source('src/index.js');
  assert.match(collection,/_manualCrop\?\.originalR2Key/);
  assert.match(collection,/originalR2Key,currentR2Key:croppedKey/);
  assert.match(collection,/status='received'/);
  assert.match(worker,/saveContactManualCrop/);
  assert.match(worker,/scheduleContactCardReverification\(env,ctx,member\.userId,cardId\)/);
  const route=worker.slice(worker.indexOf('const contactManualCropMatch'),worker.indexOf('const contactInsightRetryMatch'));
  assert.doesNotMatch(route,/queueAndFulfillCardCollectionReward/);
});

test('reverification only writes statuses allowed by the existing D1 check constraint',()=>{
  const collection=source('src/card-collection.js');
  assert.doesNotMatch(collection,/verification_(?:queued|processing)/);
  assert.match(collection,/reverifyContactFromSource[\s\S]*status='processing'/);
  assert.match(collection,/queueContactCardReverification[\s\S]*status='received'/);
});
