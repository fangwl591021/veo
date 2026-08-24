import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=(p)=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('OCR performs localization in the same Vision pass',()=>{const s=read('src/card-collection.js');assert.match(s,/cardLocalization/);assert.match(s,/boundingBox/);assert.match(s,/clippedEdges/);const start=s.indexOf('async function recognizeWithOpenAI');const end=s.indexOf('// 使用 Responses',start);const block=s.slice(start,end);assert.equal((block.match(/callAiResponses\(/g)||[]).length,1);assert.doesNotMatch(block,/web_search/);});
test('collection uses AI localization after OCR instead of local detector before OCR',()=>{const s=read('public/app.js');const prep=s.slice(s.indexOf('async function prepareBusinessCardImage'),s.indexOf('async function prepareCardLiff'));assert.doesNotMatch(prep,/processBusinessCardImage/);assert.match(s,/cropByVisionLocalization/);assert.match(s,/recognized\.localization/);assert.match(s,/x-skip-reverify/);});
test('crop-only image save does not force a second OCR',()=>{const s=read('src/index.js');assert.match(s,/x-skip-reverify/);assert.match(s,/skipReverify/);const c=read('src/card-collection.js');assert.match(c,/options\.reverify===false/);});
