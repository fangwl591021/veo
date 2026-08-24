const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export const CARD_IMAGE_THRESHOLDS = Object.freeze({ confidence:0.60, recommendedConfidence:0.85, quality:65 });

function canvasBlob(canvas, quality = 0.9) {
  return new Promise((resolve) => canvas.toBlob(resolve, "image/webp", quality));
}

function distance(a, b) {
  const dx=a.x-b.x, dy=a.y-b.y;
  return Math.hypot(dx,dy);
}

export function evaluateCardQuad(points, width, height) {
  if (!Array.isArray(points) || points.length !== 4 || !width || !height) return {confidence:0,coverage:0,aspect:0};
  const [tl,tr,br,bl]=points;
  const quadArea=Math.abs(points.reduce((sum,p,index)=>sum+p.x*points[(index+1)%4].y-p.y*points[(index+1)%4].x,0))/2;
  const coverage=quadArea/(width*height);
  const cardWidth=(distance(tl,tr)+distance(bl,br))/2;
  const cardHeight=(distance(tl,bl)+distance(tr,br))/2;
  const aspect=Math.max(cardWidth,cardHeight)/Math.max(1,Math.min(cardWidth,cardHeight));
  const aspectScore=clamp(1-Math.abs(aspect-1.65)/0.75,0,1);
  const coverageScore=clamp((coverage-0.16)/0.5,0,1);
  const edgeScore=clamp(Math.min(cardWidth/cardHeight,cardHeight/cardWidth)*1.65,0,1);
  return {confidence:Number((aspectScore*0.40+coverageScore*0.45+edgeScore*0.15).toFixed(3)),coverage,aspect,horizontal:cardWidth,vertical:cardHeight};
}

function cornerAverage(data, width, x0, y0, size) {
  const rgb=[0,0,0]; let count=0;
  for(let y=y0;y<Math.min(y0+size,data.height);y+=2) for(let x=x0;x<Math.min(x0+size,width);x+=2){
    const offset=(y*width+x)*4; rgb[0]+=data.data[offset];rgb[1]+=data.data[offset+1];rgb[2]+=data.data[offset+2];count++;
  }
  return rgb.map((value)=>value/Math.max(1,count));
}

function detectQuad(imageData) {
  const {width,height,data}=imageData; const patch=Math.max(8,Math.round(Math.min(width,height)*0.06));
  const backgrounds=[cornerAverage(imageData,width,0,0,patch),cornerAverage(imageData,width,width-patch,0,patch),cornerAverage(imageData,width,0,height-patch,patch),cornerAverage(imageData,width,width-patch,height-patch,patch)];
  const candidates=[];
  for(let y=0;y<height;y+=2) for(let x=0;x<width;x+=2){
    const offset=(y*width+x)*4; const pixel=[data[offset],data[offset+1],data[offset+2]];
    const delta=Math.min(...backgrounds.map((bg)=>Math.hypot(pixel[0]-bg[0],pixel[1]-bg[1],pixel[2]-bg[2])));
    if(delta>48)candidates.push({x,y});
  }
  if(candidates.length<Math.max(80,width*height*0.025)) return null;
  const extrema={tl:candidates[0],tr:candidates[0],br:candidates[0],bl:candidates[0]};
  for(const point of candidates){
    if(point.x+point.y<extrema.tl.x+extrema.tl.y)extrema.tl=point;
    if(point.x-point.y>extrema.tr.x-extrema.tr.y)extrema.tr=point;
    if(point.x+point.y>extrema.br.x+extrema.br.y)extrema.br=point;
    if(point.x-point.y<extrema.bl.x-extrema.bl.y)extrema.bl=point;
  }
  const points=[extrema.tl,extrema.tr,extrema.br,extrema.bl];
  const metrics=evaluateCardQuad(points,width,height);
  return {...metrics,points};
}

function solveLinear(matrix, vector) {
  const size=vector.length; const a=matrix.map((row,index)=>[...row,vector[index]]);
  for(let col=0;col<size;col++){
    let pivot=col; for(let row=col+1;row<size;row++)if(Math.abs(a[row][col])>Math.abs(a[pivot][col]))pivot=row;
    if(Math.abs(a[pivot][col])<1e-9)return null;
    [a[col],a[pivot]]=[a[pivot],a[col]]; const divisor=a[col][col]; for(let j=col;j<=size;j++)a[col][j]/=divisor;
    for(let row=0;row<size;row++){if(row===col)continue;const factor=a[row][col];for(let j=col;j<=size;j++)a[row][j]-=factor*a[col][j];}
  }
  return a.map((row)=>row[size]);
}

export function perspectiveCoefficients(points) {
  const matrix=[], vector=[]; const target=[[0,0],[1,0],[1,1],[0,1]];
  for(let index=0;index<4;index++){
    const [u,v]=target[index]; const {x,y}=points[index];
    matrix.push([u,v,1,0,0,0,-x*u,-x*v]);vector.push(x);
    matrix.push([0,0,0,u,v,1,-y*u,-y*v]);vector.push(y);
  }
  return solveLinear(matrix,vector);
}

export function warpPerspective(source, points, targetWidth, targetHeight) {
  const coefficients=perspectiveCoefficients(points); if(!coefficients)return null;
  const output=document.createElement("canvas");output.width=targetWidth;output.height=targetHeight;
  const input=source.getContext("2d").getImageData(0,0,source.width,source.height);
  const context=output.getContext("2d");const result=context.createImageData(targetWidth,targetHeight);
  for(let y=0;y<targetHeight;y++)for(let x=0;x<targetWidth;x++){
    const u=x/Math.max(1,targetWidth-1),v=y/Math.max(1,targetHeight-1);
    const divisor=coefficients[6]*u+coefficients[7]*v+1;
    const sx=clamp(Math.round((coefficients[0]*u+coefficients[1]*v+coefficients[2])/divisor),0,source.width-1);
    const sy=clamp(Math.round((coefficients[3]*u+coefficients[4]*v+coefficients[5])/divisor),0,source.height-1);
    const from=(sy*source.width+sx)*4,to=(y*targetWidth+x)*4;
    result.data[to]=input.data[from];result.data[to+1]=input.data[from+1];result.data[to+2]=input.data[from+2];result.data[to+3]=255;
  }
  context.putImageData(result,0,0);return output;
}

function qualityScores(imageData, coverage) {
  const {data}=imageData;let brightness=0,glare=0,edges=0,samples=0,previous=0;
  for(let index=0;index<data.length;index+=16){
    const luminance=data[index]*0.299+data[index+1]*0.587+data[index+2]*0.114;
    brightness+=luminance;if(luminance>246)glare++;if(samples)edges+=Math.abs(luminance-previous);previous=luminance;samples++;
  }
  const average=brightness/Math.max(1,samples),edgeAverage=edges/Math.max(1,samples-1),glareRatio=glare/Math.max(1,samples);
  const brightnessScore=clamp(100-Math.abs(average-145)*0.75,0,100);
  const blurScore=clamp(edgeAverage*5.5,0,100),glareScore=clamp(100-glareRatio*500,0,100),coverageScore=clamp(coverage*145,0,100);
  const overall=Math.round(blurScore*0.35+brightnessScore*0.25+glareScore*0.2+coverageScore*0.2);
  return {overall,blur:Math.round(blurScore),brightness:Math.round(brightnessScore),glare:Math.round(glareScore),coverage:Math.round(coverageScore)};
}

export async function processBusinessCardImage(file) {
  if(!file?.type?.startsWith("image/"))throw new Error("請選擇圖片檔案");
  const bitmap=await createImageBitmap(file);
  try{
    const detection=document.createElement("canvas");const scale=Math.min(1,720/Math.max(bitmap.width,bitmap.height));
    detection.width=Math.max(1,Math.round(bitmap.width*scale));detection.height=Math.max(1,Math.round(bitmap.height*scale));
    const detectionContext=detection.getContext("2d",{willReadFrequently:true});detectionContext.drawImage(bitmap,0,0,detection.width,detection.height);
    const imageData=detectionContext.getImageData(0,0,detection.width,detection.height);const found=detectQuad(imageData);
    if(!found)return {file:null,metadata:{processingVersion:"card-image-v1",detection:{detected:false,confidence:0},quality:qualityScores(imageData,0),processing:{perspectiveCorrected:false,cropped:false,rotated:false,lightingEnhanced:false,manualCorrection:false},corners:[],warning:"找不到清楚的名片邊界"}};
    const quality=qualityScores(imageData,found.coverage);const rawNormalized=found.points.map((point)=>({x:point.x/detection.width,y:point.y/detection.height}));const center=rawNormalized.reduce((sum,point)=>({x:sum.x+point.x/4,y:sum.y+point.y/4}),{x:0,y:0});const normalized=rawNormalized.map((point)=>({x:clamp(center.x+(point.x-center.x)*1.02,0,1),y:clamp(center.y+(point.y-center.y)*1.02,0,1)}));
    const orientation=found.horizontal>=found.vertical ? "landscape" : "portrait";
    const metadata={processingVersion:"card-image-v1",original:{width:bitmap.width,height:bitmap.height},detection:{detected:true,confidence:found.confidence},card:{orientation,rotation:0},quality,processing:{perspectiveCorrected:true,cropped:true,rotated:false,lightingEnhanced:false,manualCorrection:false},corners:normalized,warning:found.confidence<CARD_IMAGE_THRESHOLDS.recommendedConfidence ? "名片邊界信心較低，請在辨識結果頁確認內容" : ""};
    if(found.confidence<CARD_IMAGE_THRESHOLDS.confidence||quality.overall<CARD_IMAGE_THRESHOLDS.quality)return {file:null,metadata};
    const source=document.createElement("canvas");const sourceScale=Math.min(1,2000/Math.max(bitmap.width,bitmap.height));source.width=Math.round(bitmap.width*sourceScale);source.height=Math.round(bitmap.height*sourceScale);source.getContext("2d").drawImage(bitmap,0,0,source.width,source.height);
    const sourcePoints=normalized.map((point)=>({x:point.x*source.width,y:point.y*source.height}));
    const horizontal=(distance(sourcePoints[0],sourcePoints[1])+distance(sourcePoints[3],sourcePoints[2]))/2;
    const vertical=(distance(sourcePoints[0],sourcePoints[3])+distance(sourcePoints[1],sourcePoints[2]))/2;
    const longSide=Math.min(1600,Math.max(1000,Math.round(Math.max(horizontal,vertical))));const shortSide=Math.round(longSide/Math.max(1.25,found.aspect));
    const width=horizontal>=vertical?longSide:shortSide,height=horizontal>=vertical?shortSide:longSide;
    const corrected=warpPerspective(source,sourcePoints,width,height);if(!corrected)return {file:null,metadata};
    const blob=await canvasBlob(corrected,0.9);if(!blob)throw new Error("名片影像輸出失敗");
    return {file:new File([blob],"business-card-smart.webp",{type:"image/webp"}),metadata};
  } finally { bitmap.close?.(); }
}
