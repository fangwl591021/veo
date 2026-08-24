import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  CARD_IMAGE_THRESHOLDS,
  assessCardCompleteness,
  detectCardQuad,
  evaluateCardQuad,
} from '../public/card-scanner-v2.js';

const source=readFileSync(new URL('../public/card-scanner-v2.js',import.meta.url),'utf8');

test('scanner v2 is a zero-token local image pipeline',()=>{
  assert.doesNotMatch(source,/fetch\s*\(/);
  assert.doesNotMatch(source,/openai|gemini|responses|apiKey/i);
  assert.match(source,/sobelEdges/);
  assert.match(source,/houghLines/);
  assert.match(source,/warpPerspective/);
});

test('a card clipped by the camera boundary is never trusted for automatic crop',()=>{
  const points=[{x:0,y:100},{x:700,y:110},{x:690,y:520},{x:0,y:510}];
  const completeness=assessCardCompleteness(points,800,700);
  const geometry=evaluateCardQuad(points,800,700,{edgeSupport:0.98});
  assert.equal(completeness.boundaryTouch,true);
  assert.ok(completeness.score<CARD_IMAGE_THRESHOLDS.completeness);
  assert.equal(geometry.boundaryTouch,true);
});

test('edge detector can prefer a complete card over keyboard-like clutter lines',()=>{
  const width=360,height=280,data=new Uint8ClampedArray(width*height*4);
  const card=[{x:42,y:55},{x:318,y:64},{x:305,y:225},{x:50,y:214}];
  const inside=(x,y)=>{
    let sign=0;
    for(let index=0;index<4;index++){
      const a=card[index],b=card[(index+1)%4];
      const value=(b.x-a.x)*(y-a.y)-(b.y-a.y)*(x-a.x);
      if(!value)continue;
      if(sign&&Math.sign(value)!==sign)return false;
      sign=Math.sign(value);
    }
    return true;
  };
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const offset=(y*width+x)*4;
    let value=inside(x,y)?232:108;
    if(!inside(x,y)&&y<45&&x%48<4)value=195;
    if(!inside(x,y)&&y>235&&y%14<2)value=170;
    if(inside(x,y)&&x>90&&x<260&&y>100&&y<130)value=45;
    data[offset]=value;data[offset+1]=value;data[offset+2]=value;data[offset+3]=255;
  }
  const found=detectCardQuad({width,height,data});
  if(found){
    assert.ok(found.confidence>=0.58);
    assert.ok(found.points.every((point)=>Number.isFinite(point.x)&&Number.isFinite(point.y)));
  }
});
