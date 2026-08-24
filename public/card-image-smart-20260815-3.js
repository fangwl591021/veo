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
  const margin=Math.max(2,Math.min(width,height)*0.02);
  const edgeSides=[
    Math.min(tl.x,bl.x)<=margin,
    Math.min(tl.y,tr.y)<=margin,
    Math.max(tr.x,br.x)>=width-margin,
    Math.max(bl.y,br.y)>=height-margin,
  ].filter(Boolean).length;
  const plausible=aspect>=1.45&&aspect<=1.90&&coverage>=0.10&&coverage<=0.78&&edgeSides<=1;
  const aspectScore=clamp(1-Math.abs(aspect-1.65)/0.75,0,1);
  const coverageScore=clamp((coverage-0.16)/0.5,0,1);
  const edgeScore=clamp(Math.min(cardWidth/cardHeight,cardHeight/cardWidth)*1.65,0,1);
  const confidence=plausible?Number((aspectScore*0.40+coverageScore*0.45+edgeScore*0.15).toFixed(3)):0;
  return {confidence,coverage,aspect,horizontal:cardWidth,vertical:cardHeight,plausible,edgeSides};
}

function cornerAverage(data, width, x0, y0, size) {
  const rgb=[0,0,0]; let count=0;
  for(let y=y0;y<Math.min(y0+size,data.height);y+=2) for(let x=x0;x<Math.min(x0+size,width);x+=2){
    const offset=(y*width+x)*4; rgb[0]+=data.data[offset];rgb[1]+=data.data[offset+1];rgb[2]+=data.data[offset+2];count++;
  }
  return rgb.map((value)=>value/Math.max(1,count));
}

function luminance(data,offset){return data[offset]*0.299+data[offset+1]*0.587+data[offset+2]*0.114;}

function smooth(values,radius=4){
  const result=new Float32Array(values.length);
  for(let i=0;i<values.length;i++){let sum=0,count=0;for(let j=Math.max(0,i-radius);j<=Math.min(values.length-1,i+radius);j++){sum+=values[j];count++;}result[i]=sum/Math.max(1,count);}
  return result;
}

function strongestPeaks(values,count,minSeparation){
  const indexes=Array.from(values.keys()).sort((a,b)=>values[b]-values[a]);const peaks=[];
  for(const index of indexes){if(peaks.some((entry)=>Math.abs(entry.index-index)<minSeparation))continue;peaks.push({index,score:values[index]});if(peaks.length>=count)break;}
  return peaks;
}

function patchAverage(gray,width,height,x0,y0,x1,y1){
  const left=clamp(Math.round(x0),0,width),right=clamp(Math.round(x1),0,width),top=clamp(Math.round(y0),0,height),bottom=clamp(Math.round(y1),0,height);
  if(right<=left||bottom<=top)return null;let total=0,count=0;
  const step=Math.max(1,Math.round(Math.max(right-left,bottom-top)/80));
  for(let y=top;y<bottom;y+=step)for(let x=left;x<right;x+=step){total+=gray[y*width+x];count++;}
  return total/Math.max(1,count);
}

function boundaryEvidence(gray,width,height,box){
  const {x1,y1,x2,y2}=box,gap=Math.max(3,Math.round(Math.min(width,height)*0.008)),band=gap;
  const pairs=[
    [patchAverage(gray,width,height,x1,y1+gap,x2,y1+gap+band),patchAverage(gray,width,height,x1,y1-gap-band,x2,y1-gap)],
    [patchAverage(gray,width,height,x1,y2-gap-band,x2,y2-gap),patchAverage(gray,width,height,x1,y2+gap,x2,y2+gap+band)],
    [patchAverage(gray,width,height,x1+gap,y1,x1+gap+band,y2),patchAverage(gray,width,height,x1-gap-band,y1,x1-gap,y2)],
    [patchAverage(gray,width,height,x2-gap-band,y1,x2-gap,y2),patchAverage(gray,width,height,x2+gap,y1,x2+gap+band,y2)],
  ];
  const contrasts=pairs.map(([inside,outside])=>outside===null?10:Math.abs(inside-outside));
  return clamp(contrasts.reduce((sum,value)=>sum+value,0)/(contrasts.length*30),0,1);
}

export function detectCardQuad(imageData) {
  const {width,height,data}=imageData;if(width<80||height<80)return null;
  const gray=new Float32Array(width*height);for(let i=0;i<gray.length;i++)gray[i]=luminance(data,i*4);
  const rows=new Float32Array(height),columns=new Float32Array(width);
  for(let y=1;y<height-1;y++){let total=0;for(let x=0;x<width;x+=2)total+=Math.abs(gray[(y+1)*width+x]-gray[(y-1)*width+x]);rows[y]=total/Math.ceil(width/2);}
  for(let x=1;x<width-1;x++){let total=0;for(let y=0;y<height;y+=2)total+=Math.abs(gray[y*width+x+1]-gray[y*width+x-1]);columns[x]=total/Math.ceil(height/2);}
  const rowScores=smooth(rows),columnScores=smooth(columns),rowMax=Math.max(...rowScores),columnMax=Math.max(...columnScores);
  const rowPeaks=strongestPeaks(rowScores,26,Math.max(6,Math.round(height*0.012))),columnPeaks=strongestPeaks(columnScores,26,Math.max(6,Math.round(width*0.012)));
  rowPeaks.push({index:0,score:rowMax*0.45},{index:height-1,score:rowMax*0.45});columnPeaks.push({index:0,score:columnMax*0.45},{index:width-1,score:columnMax*0.45});
  const candidates=[];
  for(let a=0;a<rowPeaks.length;a++)for(let b=a+1;b<rowPeaks.length;b++)for(let c=0;c<columnPeaks.length;c++)for(let d=c+1;d<columnPeaks.length;d++){
    const y1=Math.min(rowPeaks[a].index,rowPeaks[b].index),y2=Math.max(rowPeaks[a].index,rowPeaks[b].index),x1=Math.min(columnPeaks[c].index,columnPeaks[d].index),x2=Math.max(columnPeaks[c].index,columnPeaks[d].index);
    const boxWidth=x2-x1,boxHeight=y2-y1,coverage=boxWidth*boxHeight/(width*height),aspect=Math.max(boxWidth,boxHeight)/Math.max(1,Math.min(boxWidth,boxHeight));
    if(coverage<0.10||coverage>0.78||aspect<1.45||aspect>1.90)continue;
    const edgeSides=[x1<=width*0.02,y1<=height*0.02,x2>=width*0.98,y2>=height*0.98].filter(Boolean).length;if(edgeSides>1)continue;
    const aspectScore=clamp(1-Math.abs(aspect-1.667)/0.30,0,1),centerX=(x1+x2)/(2*width),centerY=(y1+y2)/(2*height),centerScore=clamp(1-Math.hypot(centerX-0.5,centerY-0.5)/0.55,0,1);
    const projection=((rowPeaks[a].score+rowPeaks[b].score)/(2*Math.max(1,rowMax))+(columnPeaks[c].score+columnPeaks[d].score)/(2*Math.max(1,columnMax)))/2;
    const coverageScore=clamp(coverage/0.50,0,1);candidates.push({x1,y1,x2,y2,coverageScore,geometry:aspectScore*0.45+centerScore*0.15+projection*0.15+coverageScore*0.25});
  }
  candidates.sort((a,b)=>b.geometry-a.geometry);let best=null;
  for(const box of candidates.slice(0,1200)){
    const evidence=boundaryEvidence(gray,width,height,box),landscapeBonus=box.x2-box.x1>=box.y2-box.y1?0.12:0,score=box.geometry*0.45+evidence*0.35+box.coverageScore*0.20+landscapeBonus;
    if(!best||score>best.score)best={...box,score,evidence};
  }
  if(!best||best.evidence<0.24)return null;
  const points=[{x:best.x1,y:best.y1},{x:best.x2,y:best.y1},{x:best.x2,y:best.y2},{x:best.x1,y:best.y2}],metrics=evaluateCardQuad(points,width,height);
  return metrics.plausible?{...metrics,points,boundaryScore:Number(best.evidence.toFixed(3))}:null;
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
    const imageData=detectionContext.getImageData(0,0,detection.width,detection.height);const found=detectCardQuad(imageData);
    if(!found)return {file:null,metadata:{processingVersion:"card-image-v2",detection:{detected:false,confidence:0},quality:qualityScores(imageData,0),processing:{perspectiveCorrected:false,cropped:false,rotated:false,lightingEnhanced:false,manualCorrection:false},corners:[],warning:"找不到清楚的名片邊界"}};
    const quality=qualityScores(imageData,found.coverage);const rawNormalized=found.points.map((point)=>({x:point.x/detection.width,y:point.y/detection.height}));const center=rawNormalized.reduce((sum,point)=>({x:sum.x+point.x/4,y:sum.y+point.y/4}),{x:0,y:0});const normalized=rawNormalized.map((point)=>({x:clamp(center.x+(point.x-center.x)*1.02,0,1),y:clamp(center.y+(point.y-center.y)*1.02,0,1)}));
    const orientation=found.horizontal>=found.vertical ? "landscape" : "portrait";
    const metadata={processingVersion:"card-image-v2",original:{width:bitmap.width,height:bitmap.height},detection:{detected:true,confidence:found.confidence,boundaryScore:found.boundaryScore},card:{orientation,rotation:0},quality,processing:{perspectiveCorrected:true,cropped:true,rotated:false,lightingEnhanced:false,manualCorrection:false},corners:normalized,warning:found.confidence<CARD_IMAGE_THRESHOLDS.recommendedConfidence ? "名片邊界信心較低，請在辨識結果頁確認內容" : ""};
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
