import { readFileSync, writeFileSync } from 'node:fs';

function replaceExact(source, oldText, newText, label) {
  if (!source.includes(oldText)) {
    if (source.includes(newText)) return source;
    throw new Error(`Patch target not found: ${label}`);
  }
  return source.replace(oldText, newText);
}

// ---- backend OCR + localization ----
const collectionPath = 'src/card-collection.js';
let collection = readFileSync(collectionPath, 'utf8');

const oldSchema = `const OCR_SCHEMA = { type:'object', additionalProperties:false, required:['isBusinessCard','confidence','language','primaryIndustry','secondaryIndustries','industryConfidence',...Object.keys(FIELD_LIMITS)], properties:{ isBusinessCard:{type:'boolean'}, confidence:{type:'number'}, language:{type:'string'}, primaryIndustry:{type:'string',enum:[INDUSTRY_PENDING,...INDUSTRY_OPTIONS]}, secondaryIndustries:{type:'array',maxItems:2,items:{type:'string',enum:INDUSTRY_OPTIONS}}, industryConfidence:{type:'number'}, ...Object.fromEntries(Object.keys(FIELD_LIMITS).map((key)=>[key,{type:'string'}])) } };`;
const newSchema = `const CARD_POINT_SCHEMA={type:'object',additionalProperties:false,required:['x','y'],properties:{x:{type:'number',minimum:0,maximum:1},y:{type:'number',minimum:0,maximum:1}}};
const CARD_BOX_SCHEMA={type:'object',additionalProperties:false,required:['x','y','width','height'],properties:{x:{type:'number',minimum:0,maximum:1},y:{type:'number',minimum:0,maximum:1},width:{type:'number',minimum:0,maximum:1},height:{type:'number',minimum:0,maximum:1}}};
const CARD_LOCALIZATION_SCHEMA={type:'object',additionalProperties:false,required:['detected','incomplete','cropConfidence','boundingBox','corners','clippedEdges'],properties:{detected:{type:'boolean'},incomplete:{type:'boolean'},cropConfidence:{type:'number',minimum:0,maximum:1},boundingBox:CARD_BOX_SCHEMA,corners:{type:'array',minItems:4,maxItems:4,items:CARD_POINT_SCHEMA},clippedEdges:{type:'array',maxItems:4,items:{type:'string',enum:['left','right','top','bottom']}}}};
const OCR_SCHEMA = { type:'object', additionalProperties:false, required:['isBusinessCard','confidence','language','cardLocalization','primaryIndustry','secondaryIndustries','industryConfidence',...Object.keys(FIELD_LIMITS)], properties:{ isBusinessCard:{type:'boolean'}, confidence:{type:'number'}, language:{type:'string'}, cardLocalization:CARD_LOCALIZATION_SCHEMA, primaryIndustry:{type:'string',enum:[INDUSTRY_PENDING,...INDUSTRY_OPTIONS]}, secondaryIndustries:{type:'array',maxItems:2,items:{type:'string',enum:INDUSTRY_OPTIONS}}, industryConfidence:{type:'number'}, ...Object.fromEntries(Object.keys(FIELD_LIMITS).map((key)=>[key,{type:'string'}])) } };`;
collection = replaceExact(collection, oldSchema, newSchema, 'OCR schema');

const recognizeStart = collection.indexOf('async function recognizeWithOpenAI(apiKey, model, images) {');
const recognizeEnd = collection.indexOf('\n\n// 使用 Responses 的 web_search 工具', recognizeStart);
if (recognizeStart < 0 || recognizeEnd < 0) throw new Error('recognizeWithOpenAI block not found');
const newRecognize = `async function recognizeWithOpenAI(apiKey, model, images) {
  const content=[{type:'input_text',text:\`辨識這張商務名片，並在同一次視覺辨識中完成名片定位。只擷取畫面中可確認的文字，不猜測；無法確認的欄位填空字串。若不是名片，isBusinessCard=false。繁體中文保留原文。note 僅放無法歸類但有價值的名片文字。

cardLocalization 規則：
1. detected 表示是否可找到名片本體。
2. boundingBox 使用整張輸入圖片的 0~1 正規化座標 x,y,width,height，必須包住實際可見名片，不得包入明顯桌面、手掌、鍵盤等背景。
3. corners 固定回傳左上、右上、右下、左下四點，均為 0~1 正規化座標。
4. 如果名片任一實際邊緣已超出照片、碰到影像邊界而無法確認，incomplete=true，並在 clippedEdges 列出 left/right/top/bottom；不得憑空補出不存在的邊。
5. cropConfidence 表示只根據原圖定位名片邊界的信心；不確定時降低分數，不可硬猜。

並依公司、職稱、部門與服務說明做一次行業分類：主行業只能選 1 個，次行業最多 2 個且不可與主行業相同。可選行業為：\${INDUSTRY_OPTIONS.join('、')}。無法可靠判斷時 primaryIndustry 填「待分類」、secondaryIndustries 填空陣列；industryConfidence 填 0 到 1。只回傳符合 JSON Schema 的結果。\`},...businessCardImages(images)];
  const result=await callAiResponses(apiKey,{model:model || 'gpt-5.6-terra',reasoning:{effort:'low'},max_output_tokens:2100,input:[{role:'user',content}],text:{format:{type:'json_schema',name:'business_card',strict:true,schema:OCR_SCHEMA}}});
  const parsedText=outputText(result);
  if(!parsedText)throw new Error('AI 未回傳名片辨識結果');
  const parsed=JSON.parse(parsedText);
  if(!parsed.cardLocalization)throw new Error('AI 未回傳名片定位結果');
  return parsed;
}`;
collection = collection.slice(0, recognizeStart) + newRecognize + collection.slice(recognizeEnd);

collection = replaceExact(
  collection,
  `return { eventId, card:cleanCard(result), confidence:Number(result.confidence || 0), language:text(result.language,40) };`,
  `return { eventId, card:cleanCard(result), confidence:Number(result.confidence || 0), language:text(result.language,40), localization:result.cardLocalization || null };`,
  'recognizeImport localization return',
);

collection = replaceExact(
  collection,
  `export async function saveContactManualCrop(db,bucket,userId,id,file) {`,
  `export async function saveContactManualCrop(db,bucket,userId,id,file,options={}) {`,
  'manual crop signature',
);
collection = replaceExact(
  collection,
  `const row=await db.prepare(\`SELECT cc.id,cc.source_event_id,cie.front_r2_key,cie.front_content_type,cie.ocr_json\n    FROM contact_cards cc JOIN card_import_events cie ON cie.id=cc.source_event_id`,
  `const row=await db.prepare(\`SELECT cc.id,cc.source_event_id,cie.front_r2_key,cie.front_content_type,cie.ocr_json,cie.status event_status\n    FROM contact_cards cc JOIN card_import_events cie ON cie.id=cc.source_event_id`,
  'manual crop event status query',
);
collection = replaceExact(
  collection,
  `db.prepare("UPDATE card_import_events SET front_r2_key=?,front_content_type=?,status='received',ocr_json=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND scanner_user_id=?").bind(croppedKey,file.type,JSON.stringify({...ocr,_manualCrop:manualCrop}),row.source_event_id,userId),`,
  `db.prepare("UPDATE card_import_events SET front_r2_key=?,front_content_type=?,status=?,ocr_json=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND scanner_user_id=?").bind(croppedKey,file.type,options.reverify===false ? (row.event_status || 'created') : 'received',JSON.stringify({...ocr,_manualCrop:manualCrop}),row.source_event_id,userId),`,
  'manual crop optional reverify status',
);
writeFileSync(collectionPath, collection);

// ---- worker route: allow crop-only save without second OCR ----
const indexPath='src/index.js';
let index=readFileSync(indexPath,'utf8');
const oldRoute=`      const cardId=decodeURIComponent(contactManualCropMatch[1]);
      const form=await request.formData();
      const saved=await saveContactManualCrop(env.DB,env.MEDIA,member.userId,cardId,form.get("image"));
      scheduleContactCardReverification(env,ctx,member.userId,cardId);
      return json({success:true,status:"processing",manualCrop:true,eventId:saved.eventId},202);`;
const newRoute=`      const cardId=decodeURIComponent(contactManualCropMatch[1]);
      const form=await request.formData();
      const skipReverify=request.headers.get("x-skip-reverify") === "1";
      const saved=await saveContactManualCrop(env.DB,env.MEDIA,member.userId,cardId,form.get("image"),{reverify:!skipReverify});
      if(!skipReverify)scheduleContactCardReverification(env,ctx,member.userId,cardId);
      return json({success:true,status:skipReverify?"saved":"processing",manualCrop:true,eventId:saved.eventId},skipReverify?200:202);`;
index=replaceExact(index,oldRoute,newRoute,'manual crop route');
writeFileSync(indexPath,index);

// ---- frontend: no pre-OCR local auto-detection; use Vision localization after OCR ----
const appPath='public/app.js';
let app=readFileSync(appPath,'utf8');
app=replaceExact(
  app,
  `import { CARD_IMAGE_THRESHOLDS, processBusinessCardImage } from "/card-image-smart-20260815-5.js";`,
  `import { CARD_IMAGE_THRESHOLDS, orderQuad, warpPerspective } from "/card-image-smart-20260815-5.js";`,
  'app scanner import',
);
const prepStart=app.indexOf('async function prepareBusinessCardImage(file, sideLabel, purpose) {');
const prepEnd=app.indexOf('\nasync function prepareCardLiff()',prepStart);
if(prepStart<0||prepEnd<0)throw new Error('prepareBusinessCardImage block not found');
const newPrep=`async function prepareBusinessCardImage(file, sideLabel, purpose) {
  const job=await uploadCardImageOriginal(file,sideLabel,purpose);
  const processed=await compressCardImage(file);
  const metadata={
    processingVersion:'vision-localization-v3',
    detection:{detected:false,confidence:0,strategy:'vision-pending'},
    quality:{overall:100,blur:100,brightness:100,glare:100,coverage:100},
    processing:{perspectiveCorrected:false,cropped:false,rotated:false,lightingEnhanced:false,manualCorrection:false,resolutionNormalized:true},
    corners:[],warning:'等待單次 AI Vision 同時完成 OCR 與名片定位',
  };
  await saveCardImageProcessingResult(job.id,processed,metadata,'completed');
  return {file:processed,jobId:job.id,metadata};
}

function normalizedVisionLocalization(value={}){
  const clamp01=(v)=>Math.max(0,Math.min(1,Number(v)||0));
  const box=value?.boundingBox||{};
  const boundingBox={x:clamp01(box.x),y:clamp01(box.y),width:clamp01(box.width),height:clamp01(box.height)};
  const corners=Array.isArray(value?.corners)?value.corners.slice(0,4).map(p=>({x:clamp01(p?.x),y:clamp01(p?.y)})):[];
  return {detected:value?.detected===true,incomplete:value?.incomplete===true,cropConfidence:clamp01(value?.cropConfidence),boundingBox,corners,clippedEdges:Array.isArray(value?.clippedEdges)?value.clippedEdges:[]};
}
async function cropByVisionLocalization(file,rawLocalization){
  const localization=normalizedVisionLocalization(rawLocalization);
  if(!file||!localization.detected||localization.incomplete||localization.cropConfidence<0.55)return null;
  const bitmap=await createImageBitmap(file,{imageOrientation:'from-image'}).catch(()=>createImageBitmap(file));
  try{
    const scale=Math.min(1,2200/Math.max(bitmap.width,bitmap.height));
    const source=document.createElement('canvas');source.width=Math.max(1,Math.round(bitmap.width*scale));source.height=Math.max(1,Math.round(bitmap.height*scale));source.getContext('2d',{alpha:false}).drawImage(bitmap,0,0,source.width,source.height);
    let output=null;
    if(localization.corners.length===4){
      const points=orderQuad(localization.corners.map(p=>({x:p.x*source.width,y:p.y*source.height})));
      const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
      const widthEstimate=(dist(points[0],points[1])+dist(points[3],points[2]))/2;
      const heightEstimate=(dist(points[0],points[3])+dist(points[1],points[2]))/2;
      const ratio=Math.max(.45,Math.min(2.2,widthEstimate/Math.max(1,heightEstimate)));
      const long=Math.min(1600,Math.max(900,Math.round(Math.max(widthEstimate,heightEstimate))));
      const width=ratio>=1?long:Math.round(long*ratio),height=ratio>=1?Math.round(long/ratio):long;
      output=warpPerspective(source,points,width,height);
    }
    if(!output){
      const b=localization.boundingBox,x=Math.round(b.x*source.width),y=Math.round(b.y*source.height),w=Math.round(b.width*source.width),h=Math.round(b.height*source.height);
      if(w<50||h<30)return null;
      output=document.createElement('canvas');output.width=w;output.height=h;output.getContext('2d',{alpha:false}).drawImage(source,x,y,w,h,0,0,w,h);
    }
    const blob=await new Promise(resolve=>output.toBlob(resolve,'image/webp',.9));
    return blob?new File([blob],'business-card-vision-crop.webp',{type:'image/webp'}):null;
  }finally{bitmap.close?.();}
}`;
app=app.slice(0,prepStart)+newPrep+app.slice(prepEnd);

app=replaceExact(
  app,
  `let collectionScanFiles = [];\nlet collectionScanJobs = [];`,
  `let collectionScanFiles = [];\nlet collectionScanJobs = [];\nlet collectionVisionCropFile = null;\nlet collectionVisionLocalization = null;`,
  'collection vision state',
);

const oldStart=`      const submitted=await api("/v1/card-collection/imports/" + encodeURIComponent(uploaded.import.id) + "/submit",{method:"POST",body:"{}"});
      collectionScanFiles=[];collectionScanJobs=[];await cardCollection();
      if(submitted.reward?.status==="pending_validation")alert("名片辨識完成並確認不是重複收藏後，將自動贈送 10 K點。");`;
const newStart=`      const recognized=await api("/v1/card-collection/imports/" + encodeURIComponent(uploaded.import.id) + "/recognize",{method:"POST",body:"{}"});
      collectionVisionLocalization=recognized.localization||null;
      if(collectionVisionLocalization?.incomplete){
        const edges=(collectionVisionLocalization.clippedEdges||[]).join('、');
        throw new Error('名片未完整入鏡' + (edges ? '（缺少：' + edges + '）' : '') + '，請稍微拉遠重新拍攝。');
      }
      collectionVisionCropFile=await cropByVisionLocalization(collectionScanFiles[0],collectionVisionLocalization);
      showCollectionReview(recognized.eventId,recognized.card,recognized.confidence);`;
app=replaceExact(app,oldStart,newStart,'collection synchronous recognize');

const oldReviewLayout=`  layout(\`<section class="card collection-review"><button class="back-card" id="cancelCollectionReview" aria-label="返回">‹</button><h2>確認名片資料</h2><p class="muted">AI 辨識信心 \${Math.round(Number(confidence || 0)*100)}%。請先校正再收藏，避免錯誤資料。</p>\${collectionForm(card,"scan")}<button class="btn" id="saveScannedCard">儲存至名片收藏</button></section>\`);`;
const newReviewLayout=`  const previewUrl=collectionVisionCropFile?URL.createObjectURL(collectionVisionCropFile):'';
  const localization=normalizedVisionLocalization(collectionVisionLocalization||{});
  const cropNote=localization.detected ? \`AI 名片定位 \${Math.round(localization.cropConfidence*100)}%\${collectionVisionCropFile?'，已先分離名片本體':'，請確認後可手動裁切'}\` : 'AI 未能可靠定位名片外框，文字仍可先校正。';
  layout(\`<section class="card collection-review"><button class="back-card" id="cancelCollectionReview" aria-label="返回">‹</button><h2>確認名片資料</h2><p class="muted">AI 辨識信心 \${Math.round(Number(confidence || 0)*100)}%。\${esc(cropNote)}</p>\${previewUrl?\`<img src="\${esc(previewUrl)}" alt="AI 分離後名片" style="display:block;width:100%;max-height:360px;object-fit:contain;border-radius:16px;margin:12px 0;background:#f4f4f4">\`:''}\${collectionForm(card,"scan")}<button class="btn" id="saveScannedCard">儲存至名片收藏</button></section>\`);`;
app=replaceExact(app,oldReviewLayout,newReviewLayout,'collection review crop preview');

const oldAfterConfirm=`    let result=await save();if(result.response.status===409&&result.body.code==="duplicate_contact"&&confirm(\`收藏名單已有「\${result.body.duplicate?.displayName || "相同名片"}」，要用這次資料更新嗎？更新既有名片不會重複贈點。\`))result=await save("update");if(!result.response.ok)throw new Error(result.body.error||"名片儲存失敗");
    collectionScanFiles=[];await cardCollection();`;
const newAfterConfirm=`    let result=await save();if(result.response.status===409&&result.body.code==="duplicate_contact"&&confirm(\`收藏名單已有「\${result.body.duplicate?.displayName || "相同名片"}」，要用這次資料更新嗎？更新既有名片不會重複贈點。\`))result=await save("update");if(!result.response.ok)throw new Error(result.body.error||"名片儲存失敗");
    if(collectionVisionCropFile && !result.body.updated && result.body.card?.id){
      const cropForm=new FormData();cropForm.append('image',collectionVisionCropFile);
      const cropResponse=await fetch(\`/v1/card-collection/\${encodeURIComponent(result.body.card.id)}/manual-crop\`,{method:'POST',headers:{authorization:\`Bearer \${state.token}\`,'x-skip-reverify':'1'},body:cropForm});
      const cropBody=await cropResponse.json().catch(()=>({}));if(!cropResponse.ok)throw new Error(cropBody.error||'名片分離圖片儲存失敗');
    }
    collectionScanFiles=[];collectionScanJobs=[];collectionVisionCropFile=null;collectionVisionLocalization=null;await cardCollection();`;
app=replaceExact(app,oldAfterConfirm,newAfterConfirm,'save vision crop after confirm');
writeFileSync(appPath,app);

// ---- test contract ----
const testPath='test/card-vision-localization-v3.test.js';
writeFileSync(testPath,`import test from 'node:test';\nimport assert from 'node:assert/strict';\nimport {readFileSync} from 'node:fs';\nconst read=(p)=>readFileSync(new URL('../'+p,import.meta.url),'utf8');\ntest('OCR performs localization in the same Vision pass',()=>{const s=read('src/card-collection.js');assert.match(s,/cardLocalization/);assert.match(s,/boundingBox/);assert.match(s,/clippedEdges/);const start=s.indexOf('async function recognizeWithOpenAI');const end=s.indexOf('// 使用 Responses',start);const block=s.slice(start,end);assert.equal((block.match(/callAiResponses\\(/g)||[]).length,1);assert.doesNotMatch(block,/web_search/);});\ntest('collection uses AI localization after OCR instead of local detector before OCR',()=>{const s=read('public/app.js');const prep=s.slice(s.indexOf('async function prepareBusinessCardImage'),s.indexOf('async function prepareCardLiff'));assert.doesNotMatch(prep,/processBusinessCardImage/);assert.match(s,/cropByVisionLocalization/);assert.match(s,/recognized\\.localization/);assert.match(s,/x-skip-reverify/);});\ntest('crop-only image save does not force a second OCR',()=>{const s=read('src/index.js');assert.match(s,/x-skip-reverify/);assert.match(s,/skipReverify/);const c=read('src/card-collection.js');assert.match(c,/options\\.reverify===false/);});\n`);

console.log('Vision Localization V3 patch applied');
