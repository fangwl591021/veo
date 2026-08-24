import { CARD_IMAGE_THRESHOLDS } from './card-scanner-v2.js';
import { processBusinessCardImage as scanBusinessCardImage } from './card-scanner-v2-runtime.js';
import { CARD_SCANNER_RESOLUTION, canvasToCardFile, normalizeWorkingSource } from './card-scanner-v2-resolution.js';

function retakeError(message){
  const error=new Error(message);
  error.code='CARD_RETAKE_REQUIRED';
  return error;
}
function canvasBlob(canvas,quality=.9){return new Promise((resolve)=>canvas.toBlob(resolve,'image/webp',quality));}
function ensureManualCropModal(){
  let modal=document.getElementById('scannerV2ManualCropModal');
  if(modal)return modal;
  document.body.insertAdjacentHTML('beforeend',`<div class="card-cropper-modal" id="scannerV2ManualCropModal" role="dialog" aria-modal="true"><div class="card-cropper-sheet"><div class="card-cropper-head"><strong>確認名片範圍</strong><button type="button" data-scanner-crop-close>×</button></div><p style="margin:0 0 10px;font-size:13px;line-height:1.5" data-scanner-crop-reason></p><div class="card-cropper-stage"><img data-scanner-crop-image alt="名片手動裁切"></div><div class="card-cropper-tools"><button type="button" data-scanner-crop-action="zoom-out">縮小</button><button type="button" data-scanner-crop-action="zoom-in">放大</button><button type="button" data-scanner-crop-action="rotate">旋轉</button><button type="button" data-scanner-crop-action="reset">重設</button></div><div class="card-cropper-actions"><button type="button" class="btn alt" data-scanner-crop-cancel>取消</button><button type="button" class="btn" data-scanner-crop-confirm>確認裁切</button></div></div></div>`);
  return document.getElementById('scannerV2ManualCropModal');
}
async function manualWorkingFile(file){
  const normalized=await normalizeWorkingSource(file,{workingLongEdge:CARD_SCANNER_RESOLUTION.workingLongEdge});
  try{
    if(normalized.working.width===normalized.input.width&&normalized.working.height===normalized.input.height)return file;
    return await canvasToCardFile(normalized.workingCanvas,'business-card-manual-working.webp',.9);
  }finally{
    normalized.workingCanvas.width=1;normalized.workingCanvas.height=1;
  }
}
async function manualCrop(file,reason){
  if(typeof window==='undefined'||!window.Cropper)throw retakeError(`${reason}；目前無法開啟手動裁切，請重新拍攝。`);
  const safeFile=await manualWorkingFile(file);
  const modal=ensureManualCropModal(),image=modal.querySelector('[data-scanner-crop-image]'),reasonNode=modal.querySelector('[data-scanner-crop-reason]'),objectUrl=URL.createObjectURL(safeFile);
  reasonNode.textContent=`${reason}。請框選完整名片後確認；這一步完全在手機本機完成，不使用 AI。`;
  modal.classList.add('open');image.src=objectUrl;
  await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=()=>reject(new Error('名片圖片讀取失敗'));});
  const cropper=new window.Cropper(image,{viewMode:1,dragMode:'move',autoCropArea:.92,cropBoxMovable:true,cropBoxResizable:true,zoomable:true,zoomOnTouch:true,zoomOnWheel:true,movable:true,responsive:true,background:false,guides:true,center:true,highlight:false});
  modal.querySelectorAll('[data-scanner-crop-action]').forEach((button)=>button.onclick=()=>{
    const action=button.dataset.scannerCropAction;
    if(action==='zoom-in')cropper.zoom(.1);
    if(action==='zoom-out')cropper.zoom(-.1);
    if(action==='rotate')cropper.rotate(90);
    if(action==='reset')cropper.reset();
  });
  return new Promise((resolve,reject)=>{
    let settled=false;
    const finish=(value,error)=>{
      if(settled)return;
      settled=true;cropper.destroy();URL.revokeObjectURL(objectUrl);modal.classList.remove('open');
      if(error)reject(error);else resolve(value);
    };
    const cancel=()=>finish(null,retakeError('已取消手動裁切，尚未送出 OCR'));
    modal.querySelector('[data-scanner-crop-close]').onclick=cancel;
    modal.querySelector('[data-scanner-crop-cancel]').onclick=cancel;
    modal.querySelector('[data-scanner-crop-confirm]').onclick=async()=>{
      const button=modal.querySelector('[data-scanner-crop-confirm]');
      try{
        button.disabled=true;button.textContent='裁切中…';
        const canvas=cropper.getCroppedCanvas({maxWidth:2000,maxHeight:2000,imageSmoothingEnabled:true,imageSmoothingQuality:'high'});
        const blob=await canvasBlob(canvas,.9);
        if(!blob)throw new Error('名片裁切失敗');
        finish(new File([blob],'business-card-manual.webp',{type:'image/webp'}));
      }catch(error){finish(null,error);}
      finally{button.disabled=false;button.textContent='確認裁切';}
    };
  });
}
function manualMetadata(base={}){
  const quality=base.quality||{};
  return {
    ...base,
    detection:{detected:true,confidence:1},
    quality:{...quality,overall:Math.max(CARD_IMAGE_THRESHOLDS.quality,Number(quality.overall)||0)},
    processing:{...(base.processing||{}),perspectiveCorrected:false,cropped:true,manualCorrection:true,resolutionNormalized:true},
    warning:'自動定位未通過，已由使用者手動確認裁切範圍；沒有使用 AI 裁切。',
  };
}
function trustedAutoResult(result){
  const metadata=result.metadata||{},quality=metadata.quality||{};
  const blur=Number(quality.blur||0),brightness=Number(quality.brightness||0),glare=Number(quality.glare||0);
  if(blur<25||brightness<20||glare<20){
    throw retakeError('名片照片過度模糊、過暗或反光，請重新拍攝；系統不會浪費一次 AI OCR');
  }
  if(Number(quality.overall||0)>=CARD_IMAGE_THRESHOLDS.quality)return result;
  return {
    ...result,
    metadata:{
      ...metadata,
      quality:{...quality,overall:CARD_IMAGE_THRESHOLDS.quality},
      warning:metadata.warning||'幾何補正已通過，影像已做本機輕度增強後送入 OCR。',
    },
  };
}

export async function processBusinessCardImage(file){
  const result=await scanBusinessCardImage(file);
  if(result.file)return trustedAutoResult(result);
  const metadata=result.metadata||{};
  const warning=String(metadata.warning||'');
  if(metadata.detection?.detected&&/未完整入鏡|貼近照片邊界/.test(warning)){
    throw retakeError('名片可能沒有完整入鏡或貼到照片邊界，請稍微拉遠後重新拍攝；系統不會把這張圖送給 AI OCR');
  }
  const reason=metadata.detection?.detected
    ? '自動掃描已找到名片，但四邊定位信心不足'
    : '自動掃描找不到可靠的四條名片邊界';
  const cropped=await manualCrop(file,reason);
  return {file:cropped,metadata:manualMetadata(metadata)};
}
