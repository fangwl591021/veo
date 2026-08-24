import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { verifyContactCardData } from '../src/card-collection.js';

const row={
  id:'contact_1',scanner_user_id:'user_1',status:'active',display_name:'王小明',english_name:'',company_name:'範例公司',job_title:'',department:'',mobile:'0912345678',company_phone:'',email:'hello@example.com',website_url:'https://example.com/',line_url:'',address:'台北市信義區市府路1號',service_description:'',note:'',versions_json:'{}',selected_version:'standard',chat_alt_text:'',front_r2_key:'',ocr_json:JSON.stringify({displayName:'王小明',companyName:'範例公司',mobile:'0912345678',email:'hello@example.com',websiteUrl:'example.com',address:'台北市信義區市府路1號'}),
};
const dbFor=(value=row)=>({prepare(){return {bind(){return {first:async()=>value}}}}});
const verifiedChecks=['displayName','companyName','mobile','email','websiteUrl','address'].map((field)=>({field,status:'verified',reason:'與原始名片及公開資料一致',evidence:'原始名片 OCR 與公開網站'}));

function providerFor(result,onRequest=()=>{}){
  return {fetch:async(url,init)=>{const body=JSON.parse(init.body);onRequest(body.request);return Response.json({output_text:JSON.stringify(result)})}};
}

test('contact data verification checks every filled public field before saving', async()=>{
  let request;
  const result=await verifyContactCardData(dbFor(),'user_1','contact_1',{companyName:'人工修正公司'},providerFor({passed:true,checks:verifiedChecks,summary:'全部通過'},(value)=>{request=value}),'gpt-test');
  assert.equal(result.passed,true);
  assert.equal(result.checks.length,6);
  assert.deepEqual(request.tools,[{type:'web_search'}]);
  assert.match(request.input[0].content,/台北市信義區市府路1號/);
  assert.match(request.input[0].content,/人工修正資料是目前主資料/);
  assert.match(request.input[0].content,/人工修正公司/);
  assert.match(request.input[0].content,/範例公司/);
  assert.doesNotMatch(request.input[0].content,/家庭 Family|生日/);
});

test('AI verification is advisory when public evidence is unavailable', async()=>{
  const checks=verifiedChecks.map((item)=>item.field==='address'?{...item,status:'unverifiable',reason:'找不到地址依據',evidence:''}:item);
  const result=await verifyContactCardData(dbFor(),'user_1','contact_1',{companyName:'人工修正公司'},providerFor({passed:false,checks,summary:'地址未通過'}),'gpt-test');
  assert.equal(result.passed,false);
  assert.equal(result.advisory,true);
  assert.equal(result.verificationErrors[0].field,'address');
});

test('manual corrections can save while AI verification runs in the background', async()=>{
  const result=await verifyContactCardData(dbFor(),'user_1','contact_1',{companyName:'人工修正公司'},null,'gpt-test');
  assert.equal(result.passed,false);
  assert.equal(result.advisory,true);
  assert.match(result.summary,/人工修正仍可儲存/);
});

test('format failure still blocks before save and valid edits queue background AI', async()=>{
  let called=false;
  await assert.rejects(()=>verifyContactCardData(dbFor(),'user_1','contact_1',{email:'not-an-email'},providerFor({},()=>{called=true}),'gpt-test'),/Email 格式不正確/);
  assert.equal(called,false);
  const source=readFileSync(new URL('../src/index.js',import.meta.url),'utf8');
  const patchSource=source.slice(source.indexOf('if (request.method === "PATCH" && contactCardMatch)'));
  assert.ok(patchSource.indexOf('verification=await verifyContactCardData')<patchSource.indexOf('card=await updateContact'));
  assert.match(patchSource,/verifyContactCardData\(env\.DB,member\.userId,id,payload,null/);
  assert.ok(patchSource.indexOf('card=await updateContact')<patchSource.indexOf('verificationQueued=await queueContactCardReverification'));
  const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
  assert.match(app,/儲存修改/);
  assert.match(app,/AI 將在背景補強/);
});
