import assert from 'node:assert/strict';
import test from 'node:test';
import { CARD_SCANNER_RESOLUTION, analysisPointsToWorking, finalOutputSize, fitInside, resolutionPlan } from '../public/card-scanner-v2-resolution.js';
import { readFileSync } from 'node:fs';

const source=(path)=>readFileSync(new URL(`../${path}`,import.meta.url),'utf8');

test('high-resolution phone photo is reduced before analysis',()=>{
  const plan=resolutionPlan(4032,3024);
  assert.deepEqual(plan.working,{width:2200,height:1650,scaleFromInput:2200/4032});
  assert.equal(plan.analysis.width,1280);
  assert.equal(plan.analysis.height,960);
  assert.ok(plan.analysis.scaleFromInput<plan.working.scaleFromInput);
});

test('small images are never enlarged during normalization',()=>{
  assert.deepEqual(fitInside(1200,720,CARD_SCANNER_RESOLUTION.workingLongEdge),{width:1200,height:720,scale:1});
  const plan=resolutionPlan(1200,720);
  assert.equal(plan.working.width,1200);
  assert.equal(plan.analysis.width,1200);
});

test('analysis coordinates map back to the working image',()=>{
  const plan=resolutionPlan(4032,3024);
  const mapped=analysisPointsToWorking([{x:128,y:96},{x:1152,y:864}],plan);
  assert.deepEqual(mapped,[{x:220,y:165},{x:1980,y:1485}]);
});

test('final output uses a controlled landscape or portrait target',()=>{
  assert.deepEqual(finalOutputSize(2000,1200),{width:1600,height:960,upscaled:false});
  assert.deepEqual(finalOutputSize(1200,2000),{width:960,height:1600,upscaled:false});
});

test('final output does not upscale low-resolution crops',()=>{
  assert.deepEqual(finalOutputSize(1000,600),{width:1000,height:600,upscaled:false});
});

test('working-only normalizer exists for upload and Cropper memory safety',()=>{
  const resolution=source('public/card-scanner-v2-resolution.js');
  const start=resolution.indexOf('export async function normalizeWorkingSource');
  const end=resolution.indexOf('export async function normalizeCardSource');
  const block=resolution.slice(start,end);
  assert.ok(start>=0&&end>start);
  assert.match(block,/workingLongEdge=CARD_SCANNER_RESOLUTION\.workingLongEdge/);
  assert.doesNotMatch(block,/analysisCanvas/);
  assert.match(block,/source\.close/);
});
