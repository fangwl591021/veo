import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { CARD_IMAGE_THRESHOLDS, detectCardQuad, evaluateCardQuad, expandCardQuad, perspectiveCoefficients, warpPerspective } from "../public/card-image-smart-20260815-5.js";
import { normalizeCardImageMetadata } from "../src/card-image-processing.js";

const source = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");

test("high-confidence business-card geometry passes automatic processing thresholds", () => {
  const metrics=evaluateCardQuad([{x:80,y:80},{x:920,y:95},{x:900,y:610},{x:95,y:600}],1000,700);
  assert.ok(metrics.confidence >= CARD_IMAGE_THRESHOLDS.confidence);
  assert.ok(metrics.coverage > 0.5);
  assert.equal(perspectiveCoefficients([{x:0,y:0},{x:100,y:0},{x:100,y:60},{x:0,y:60}]).length,8);
});

test("low-coverage geometry falls back to manual review", () => {
  const metrics=evaluateCardQuad([{x:440,y:300},{x:560,y:300},{x:560,y:370},{x:440,y:370}],1000,700);
  assert.ok(metrics.confidence < CARD_IMAGE_THRESHOLDS.confidence);
});

test("a nearly full-frame photo can never be accepted as a business card", () => {
  const metrics=evaluateCardQuad([{x:1,y:1},{x:999,y:1},{x:999,y:699},{x:1,y:699}],1000,700);
  assert.equal(metrics.plausible,false);
  assert.equal(metrics.confidence,0);
});

test("detector uses the paper region instead of inner text edges", () => {
  const width=300,height=220,data=new Uint8ClampedArray(width*height*4);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const inside=x>=20&&x<=280&&y>=32&&y<=188;
    const text=inside&&x>=95&&x<=220&&y>=80&&y<=112;
    const value=text?35:(inside?235:105),offset=(y*width+x)*4;
    data[offset]=value;data[offset+1]=value;data[offset+2]=value;data[offset+3]=255;
  }
  const found=detectCardQuad({width,height,data});
  assert.ok(found);
  assert.ok(found.aspect>1.55&&found.aspect<1.78);
  assert.ok(found.coverage>0.5);
  assert.ok(found.points[0].x<40&&found.points[2].x>260);
});

test("detector rejects a hand protrusion and keeps the four paper corners", () => {
  const width=320,height=240,data=new Uint8ClampedArray(width*height*4);
  const expected=[{x:35,y:30},{x:285,y:43},{x:270,y:185},{x:48,y:176}];
  const inside=(x,y)=>{let sign=0;for(let index=0;index<4;index++){const a=expected[index],b=expected[(index+1)%4],cross=(b.x-a.x)*(y-a.y)-(b.y-a.y)*(x-a.x);if(!cross)continue;if(sign&&Math.sign(cross)!==sign)return false;sign=Math.sign(cross);}return true;};
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    let rgb=[112,118,124];
    if(inside(x,y))rgb=[235,226,198];
    if(x>=145&&x<=172&&y>=175&&y<=220)rgb=[205,145,115];
    const offset=(y*width+x)*4;data[offset]=rgb[0];data[offset+1]=rgb[1];data[offset+2]=rgb[2];data[offset+3]=255;
  }
  const found=detectCardQuad({width,height,data});
  assert.ok(found);
  assert.ok(found.confidence>=CARD_IMAGE_THRESHOLDS.confidence);
  assert.ok(found.points[2].y<195,"finger must not become the bottom-right paper corner");
  assert.ok(found.points.every(point=>Number.isFinite(point.x)&&Number.isFinite(point.y)));
});

test("detector declines auto crop when paper and background have no separation", () => {
  const width=220,height=160,data=new Uint8ClampedArray(width*height*4);
  for(let index=0;index<data.length;index+=4){data[index]=180;data[index+1]=180;data[index+2]=180;data[index+3]=255;}
  assert.equal(detectCardQuad({width,height,data}),null);
});
test("safe padding shifts across image edges instead of clipping card content", () => {
  const expanded=expandCardQuad([{x:0,y:605},{x:2879,y:605},{x:2879,y:2358},{x:0,y:2358}],3024,4032);
  assert.equal(expanded[0].x,0);
  assert.ok(expanded[1].x>2879);
  assert.ok(expanded[0].y<605);
  assert.ok(expanded[2].y>2358);
  const phonePhoto=expandCardQuad([{x:129,y:5},{x:643,y:5},{x:643,y:315},{x:129,y:315}],720,540);
  assert.ok(phonePhoto[0].x<129);
  assert.ok(phonePhoto[1].x>643);
  assert.equal(phonePhoto[0].y,0);
  assert.ok(phonePhoto[2].y>315);
});

test("perspective warp calculates both source coordinates without a runtime reference error", () => {
  const previousDocument=globalThis.document;
  const pixels=new Uint8ClampedArray([
    10,20,30,255, 40,50,60,255,
    70,80,90,255, 100,110,120,255,
  ]);
  const outputContext={
    output:null,
    createImageData:(width,height)=>({data:new Uint8ClampedArray(width*height*4)}),
    putImageData(imageData){this.output=imageData;},
  };
  globalThis.document={createElement:()=>({width:0,height:0,getContext:()=>outputContext})};
  const source={width:2,height:2,getContext:()=>({getImageData:()=>({data:pixels})})};
  try{
    warpPerspective(source,[{x:0,y:0},{x:1,y:0},{x:1,y:1},{x:0,y:1}],2,2);
    assert.deepEqual([...outputContext.output.data], [...pixels]);
  } finally {
    if(previousDocument===undefined)delete globalThis.document;
    else globalThis.document=previousDocument;
  }
});
test("server normalizes untrusted processing metadata", () => {
  const metadata=normalizeCardImageMetadata({
    detection:{detected:true,confidence:5},quality:{overall:999,blur:-2},
    corners:[{x:-1,y:2},{x:0.2,y:0.3},{x:0.8,y:0.4},{x:1.5,y:-3}],
    processing:{perspectiveCorrected:true,manualCorrection:true},
  });
  assert.equal(metadata.detection.confidence,1);
  assert.equal(metadata.quality.overall,100);
  assert.equal(metadata.quality.blur,0);
  assert.deepEqual(metadata.corners[0],{x:0,y:1});
});

test("original and processed images have separate authenticated storage contracts", () => {
  const worker=source("src/index.js");
  const processing=source("src/card-image-processing.js");
  const collection=source("src/card-collection.js");
  const migration=source("migrations/0046_card_image_processing.sql");
  assert.match(worker, /POST[\s\S]*\/v1\/card-images/);
  assert.match(worker, /currentMember\(request, env\)/);
  assert.match(processing, /bucket\.put\(originalKey, request\.body/);
  assert.match(processing, /processed-r2-key|processed_r2_key/);
  assert.match(collection, /frontJobId|key \+ 'JobId'/);
  assert.match(migration, /original_r2_key TEXT NOT NULL/);
  assert.match(migration, /processed_r2_key TEXT NOT NULL DEFAULT ''/);
});

test("production browser flow preserves originals and only sends processed job ids into OCR", () => {
  const app=source("public/app.js");
  const production=source("public/app-20260815-132.js");
  for(const text of [app,production]){
    assert.match(text,/uploadCardImageOriginal\(file, sideLabel, purpose\)/);
    assert.doesNotMatch(text,/processBusinessCardImage\(file\)/);
    assert.match(text,/processingVersion:'vision-localization-v3'/);
    assert.match(text,/cropByVisionLocalization/);
    assert.match(text,/recognized\.localization/);
    assert.match(text,/x-skip-reverify/);
    assert.match(text,/form\.append\("frontJobId",collectionScanJobs\[0\]\)/);
  }
});
