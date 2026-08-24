import { CARD_SCANNER_RESOLUTION, canvasToCardFile, normalizeWorkingSource } from './card-scanner-v2-resolution.js';

const browser=typeof window!=='undefined'&&typeof window.fetch==='function';
const originalFetch=browser?window.fetch.bind(window):null;
let installed=false;

function isCardImageUpload(input,init={}){
  const method=String(init.method||'GET').toUpperCase();
  if(method!=='POST')return false;
  const url=typeof input==='string'?input:input?.url||'';
  return /\/v1\/card-images(?:\?|$)/.test(url)&&init.body instanceof Blob&&String(init.body.type||'').startsWith('image/');
}

async function normalizedUploadBody(file){
  const normalized=await normalizeWorkingSource(file,{workingLongEdge:CARD_SCANNER_RESOLUTION.workingLongEdge});
  try{
    if(normalized.working.width===normalized.input.width&&normalized.working.height===normalized.input.height)return file;
    return await canvasToCardFile(normalized.workingCanvas,'business-card-working.webp',.88);
  }finally{
    normalized.workingCanvas.width=1;normalized.workingCanvas.height=1;
  }
}

export function installCardUploadNormalizer(){
  if(!browser||installed)return;
  installed=true;
  window.fetch=async (input,init={})=>{
    if(!isCardImageUpload(input,init))return originalFetch(input,init);
    const body=await normalizedUploadBody(init.body);
    const headers=new Headers(init.headers||{});
    headers.set('content-type',body.type||'image/webp');
    headers.set('x-card-file-size',String(body.size));
    headers.set('x-card-resolution-normalized','1');
    return originalFetch(input,{...init,headers,body});
  };
}

installCardUploadNormalizer();
