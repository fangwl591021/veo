const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));

export const CARD_SCANNER_RESOLUTION=Object.freeze({
  workingLongEdge:2200,
  analysisLongEdge:1280,
  analysisFallbackLongEdge:960,
  finalLongEdge:1600,
  targetLandscape:{width:1600,height:960},
  targetPortrait:{width:960,height:1600},
  outputType:'image/webp',
  outputQuality:0.86,
});

export function fitInside(width,height,maxLongEdge){
  const w=Math.max(1,Math.round(Number(width)||1)),h=Math.max(1,Math.round(Number(height)||1)),limit=Math.max(1,Math.round(Number(maxLongEdge)||1));
  const longEdge=Math.max(w,h);
  if(longEdge<=limit)return {width:w,height:h,scale:1};
  const scale=limit/longEdge;
  return {width:Math.max(1,Math.round(w*scale)),height:Math.max(1,Math.round(h*scale)),scale};
}

export function resolutionPlan(width,height,{workingLongEdge=CARD_SCANNER_RESOLUTION.workingLongEdge,analysisLongEdge=CARD_SCANNER_RESOLUTION.analysisLongEdge}={}){
  const input={width:Math.max(1,Math.round(Number(width)||1)),height:Math.max(1,Math.round(Number(height)||1))};
  const working=fitInside(input.width,input.height,workingLongEdge);
  const analysis=fitInside(working.width,working.height,analysisLongEdge);
  return {
    input,
    working:{width:working.width,height:working.height,scaleFromInput:working.scale},
    analysis:{width:analysis.width,height:analysis.height,scaleFromWorking:analysis.scale,scaleFromInput:working.scale*analysis.scale},
  };
}

export function mapPoints(points,scaleX,scaleY=scaleX){
  if(!Array.isArray(points))return [];
  return points.map((point)=>({x:Number(point?.x||0)*scaleX,y:Number(point?.y||0)*scaleY}));
}

export function analysisPointsToWorking(points,plan){
  const analysis=plan?.analysis,working=plan?.working;
  if(!analysis?.width||!analysis?.height||!working?.width||!working?.height)return [];
  return mapPoints(points,working.width/analysis.width,working.height/analysis.height);
}

export function finalOutputSize(cardWidth,cardHeight){
  const width=Math.max(1,Number(cardWidth)||1),height=Math.max(1,Number(cardHeight)||1),landscape=width>=height;
  const target=landscape?CARD_SCANNER_RESOLUTION.targetLandscape:CARD_SCANNER_RESOLUTION.targetPortrait;
  const sourceLong=Math.max(width,height),targetLong=Math.max(target.width,target.height);
  if(sourceLong>=targetLong)return {...target,upscaled:false};
  const ratio=sourceLong/targetLong;
  return {width:Math.max(1,Math.round(target.width*ratio)),height:Math.max(1,Math.round(target.height*ratio)),upscaled:false};
}

export async function imageBitmapFromFile(file){
  if(!file?.type?.startsWith('image/'))throw new Error('請選擇圖片檔案');
  if(typeof createImageBitmap==='function')return createImageBitmap(file,{imageOrientation:'from-image'}).catch(()=>createImageBitmap(file));
  const url=URL.createObjectURL(file);
  try{
    const image=new Image();image.decoding='async';image.src=url;
    await image.decode().catch(()=>new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=reject;}));
    return image;
  } finally { URL.revokeObjectURL(url); }
}

function drawScaled(source,width,height){
  const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
  const context=canvas.getContext('2d',{alpha:false});
  context.imageSmoothingEnabled=true;context.imageSmoothingQuality='high';
  context.drawImage(source,0,0,width,height);
  return canvas;
}

export async function normalizeWorkingSource(file,{workingLongEdge=CARD_SCANNER_RESOLUTION.workingLongEdge}={}){
  const source=await imageBitmapFromFile(file);
  try{
    const width=source.naturalWidth||source.width,height=source.naturalHeight||source.height;
    const input={width:Math.max(1,Math.round(width)),height:Math.max(1,Math.round(height))};
    const working=fitInside(input.width,input.height,workingLongEdge);
    const workingCanvas=drawScaled(source,working.width,working.height);
    return {input,working:{width:working.width,height:working.height,scaleFromInput:working.scale},workingCanvas};
  }finally{
    if(typeof source.close==='function')source.close();
  }
}

export async function normalizeCardSource(file,options={}){
  const base=await normalizeWorkingSource(file,options);
  const analysis=fitInside(base.working.width,base.working.height,options.analysisLongEdge||CARD_SCANNER_RESOLUTION.analysisLongEdge);
  const analysisCanvas=drawScaled(base.workingCanvas,analysis.width,analysis.height);
  return {
    plan:{
      input:base.input,
      working:base.working,
      analysis:{width:analysis.width,height:analysis.height,scaleFromWorking:analysis.scale,scaleFromInput:base.working.scaleFromInput*analysis.scale},
    },
    workingCanvas:base.workingCanvas,
    analysisCanvas,
  };
}

export function releaseNormalizedSource(value={}){
  for(const canvas of [value.analysisCanvas,value.workingCanvas]){
    if(canvas){canvas.width=1;canvas.height=1;}
  }
}

export async function canvasToCardFile(canvas,name='business-card.webp',quality=CARD_SCANNER_RESOLUTION.outputQuality){
  const blob=await new Promise((resolve)=>canvas.toBlob(resolve,CARD_SCANNER_RESOLUTION.outputType,clamp(Number(quality)||0.86,0.6,0.95)));
  if(!blob)throw new Error('名片圖片輸出失敗');
  return new File([blob],name,{type:CARD_SCANNER_RESOLUTION.outputType});
}
