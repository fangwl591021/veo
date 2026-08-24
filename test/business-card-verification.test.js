import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { businessCardVerificationPrompt, mergeVerifiedCard, OCR_VERIFICATION_VERSION } from '../src/card-collection.js';

const source=(path)=>readFileSync(new URL(`../${path}`,import.meta.url),'utf8');

test('business-card verification searches strong identifiers and official registries',()=>{
  const prompt=businessCardVerificationPrompt({displayName:'劉硯田',companyName:'瑞銓聯合法律事務所',mobile:'0982-299-034',address:'高雄市'});
  for(const marker of ['電話原字串','完整地址','Email','findbiz.nat.gov.tw','gcis.nat.gov.tw','統編','公會或政府名冊'])assert.match(prompt,new RegExp(marker));
  assert.equal(OCR_VERIFICATION_VERSION,'visual-web-v2');
  const cardSource=source('src/card-collection.js');
  assert.match(cardSource,/cardLocalization/);
  assert.match(cardSource,/boundingBox/);
  assert.match(cardSource,/clippedEdges/);
  const start=cardSource.indexOf('async function recognizeWithOpenAI');
  const end=cardSource.indexOf('// 使用 Responses',start);
  const primary=cardSource.slice(start,end);
  assert.equal((primary.match(/callAiResponses\(/g)||[]).length,1);
  assert.doesNotMatch(primary,/web_search/);
  assert.match(cardSource,/reverifyContactFromSource/);
});

test('reverification corrects untouched OCR fields but preserves manual edits',()=>{
  const original={displayName:'劉硯田',companyName:'瑞銓聯合法律事務所',jobTitle:'律師',mobile:'0982-299-034'};
  const verified={...original,companyName:'瑞鋐聯合法律事務所'};
  const row={display_name:'劉硯田（人工確認）',company_name:original.companyName,job_title:'律師',mobile:'0982-299-034'};
  const merged=mergeVerifiedCard(row,original,verified);
  assert.equal(merged.displayName,'劉硯田（人工確認）');
  assert.equal(merged.companyName,'瑞鋐聯合法律事務所');
});

test('AI CRM uses strict government-first company research rules',()=>{
  const crm=source('src/ai-card-crm.js');
  const worker=source('src/index.js');
  assert.match(crm,/company-enrichment-v2/);
  assert.match(crm,/findbiz\.nat\.gov\.tw/);
  assert.match(crm,/電話原字串與純數字/);
  assert.match(worker,/scheduleContactCardReverification/);
  assert.match(worker,/queueMemberCardVerificationBackfill/);
});