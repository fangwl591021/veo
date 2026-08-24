import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app=readFileSync(new URL('../public/app-20260815-132.js',import.meta.url),'utf8');

test('Vision V3 requires conservative crop confidence',()=>{
  assert.match(app,/cropConfidence<0\.72/);
});

test('Vision V3 treats bounding box as card location authority and corners only as perspective evidence',()=>{
  assert.match(app,/const b=localization\.boundingBox/);
  assert.match(app,/const boxIou=union>0\?intersection\/union:0/);
  assert.match(app,/centerDelta<=0\.06/);
  assert.match(app,/ratioAgreement<=1\.22/);
  assert.match(app,/const cornersAgreeWithBox=boxIou>=0\.72/);
  assert.match(app,/if\(cornersAgreeWithBox\)/);
});

test('Vision V3 keeps bounded safety padding for both corner warp and bounding-box crop',()=>{
  assert.match(app,/\*1\.025/);
  assert.match(app,/Math\.max\(0,Math\.min\(source\.width-1/);
  assert.match(app,/padX=b\.width\*\.015/);
  assert.match(app,/padY=b\.height\*\.015/);
});

test('Vision V3 rejects tiny boxes and only uses card-like corner aspect ratios for perspective warp',()=>{
  assert.match(app,/b\.width<0\.08\|\|b\.height<0\.05/);
  assert.match(app,/Math\.min\(widthEstimate,heightEstimate\)>=80/);
  assert.match(app,/rawRatio>=1\.20&&rawRatio<=2\.15/);
  assert.match(app,/rawRatio>=0\.46&&rawRatio<=0\.83/);
});

test('Vision V3 falls back to bounding-box crop when corners disagree instead of preserving background',()=>{
  assert.match(app,/if\(!output\)\{/);
  assert.match(app,/drawImage\(source,bx,by,bw,bh,0,0,bw,bh\)/);
});

test('Vision V3 never upscales a low-resolution perspective crop to an artificial minimum',()=>{
  assert.doesNotMatch(app,/Math\.max\(900/);
  assert.match(app,/Math\.min\(1600,Math\.max\(1,Math\.round\(Math\.max\(widthEstimate,heightEstimate\)\)\)\)/);
});
