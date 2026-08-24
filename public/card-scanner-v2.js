const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
const radians=(degrees)=>degrees*Math.PI/180;
const angleDistance=(a,b)=>{const raw=Math.abs(a-b)%180;return Math.min(raw,180-raw);};
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const percentile=(values,ratio)=>{
  if(!values.length)return 0;
  const sorted=[...values].sort((a,b)=>a-b);
  return sorted[Math.min(sorted.length-1,Math.max(0,Math.floor((sorted.length-1)*ratio)))];
};

export const CARD_IMAGE_THRESHOLDS=Object.freeze({
  confidence:0.78,
  recommendedConfidence:0.88,
  quality:62,
  completeness:0.82,
});

function polygonArea(points){
  return Math.abs(points.reduce((sum,point,index)=>{
    const next=points[(index+1)%points.length];
    return sum+point.x*next.y-point.y*next.x;
  },0))/2;
}
function cross(a,b,c){return (b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);}
function isConvex(points){
  if(!Array.isArray(points)||points.length!==4)return false;
  const signs=points.map((point,index)=>Math.sign(cross(point,points[(index+1)%4],points[(index+2)%4]))).filter(Boolean);
  return signs.length===4&&signs.every((sign)=>sign===signs[0]);
}
function cornerCosine(a,b,c){
  const ux=a.x-b.x,uy=a.y-b.y,vx=c.x-b.x,vy=c.y-b.y;
  return Math.abs((ux*vx+uy*vy)/Math.max(1,Math.hypot(ux,uy)*Math.hypot(vx,vy)));
}
export function orderQuad(points){
  if(!Array.isArray(points)||points.length!==4)return points;
  const sums=points.map((point)=>point.x+point.y);
  const diffs=points.map((point)=>point.x-point.y);
  const indexOf=(values,fn)=>values.reduce((best,value,index)=>fn(value,values[best])?index:best,0);
  const tl=points[indexOf(sums,(a,b)=>a<b)];
  const br=points[indexOf(sums,(a,b)=>a>b)];
  const tr=points[indexOf(diffs,(a,b)=>a>b)];
  const bl=points[indexOf(diffs,(a,b)=>a<b)];
  const ordered=[tl,tr,br,bl];
  if(new Set(ordered).size!==4){
    const center=points.reduce((sum,point)=>({x:sum.x+point.x/4,y:sum.y+point.y/4}),{x:0,y:0});
    const circular=[...points].sort((a,b)=>Math.atan2(a.y-center.y,a.x-center.x)-Math.atan2(b.y-center.y,b.x-center.x));
    const start=circular.reduce((best,point,index)=>point.x+point.y<circular[best].x+circular[best].y?index:best,0);
    return [...circular.slice(start),...circular.slice(0,start)];
  }
  return ordered;
}

export function assessCardCompleteness(points,width,height){
  if(!Array.isArray(points)||points.length!==4||!width||!height)return {score:0,boundaryTouch:true,minMarginRatio:0};
  const minDim=Math.min(width,height);
  const margins=points.flatMap((point)=>[point.x,point.y,width-point.x,height-point.y]);
  const minMargin=Math.min(...margins);
  const minMarginRatio=minMargin/Math.max(1,minDim);
  const boundaryTouch=minMarginRatio<0.012;
  const score=boundaryTouch?0.35:clamp((minMarginRatio-0.012)/0.055,0,1)*0.35+0.65;
  return {score:Number(score.toFixed(3)),boundaryTouch,minMarginRatio:Number(minMarginRatio.toFixed(4))};
}

export function evaluateCardQuad(points,width,height,evidence={}){
  if(!Array.isArray(points)||points.length!==4||!width||!height)return {confidence:0,coverage:0,aspect:0,plausible:false,completeness:0};
  const [tl,tr,br,bl]=orderQuad(points);
  const area=polygonArea([tl,tr,br,bl]);
  const coverage=area/(width*height);
  const top=distance(tl,tr),bottom=distance(bl,br),left=distance(tl,bl),right=distance(tr,br);
  const cardWidth=(top+bottom)/2,cardHeight=(left+right)/2;
  const aspect=Math.max(cardWidth,cardHeight)/Math.max(1,Math.min(cardWidth,cardHeight));
  const maxAngleCos=Math.max(cornerCosine(bl,tl,tr),cornerCosine(tl,tr,br),cornerCosine(tr,br,bl),cornerCosine(br,bl,tl));
  const convex=isConvex([tl,tr,br,bl]);
  const oppositeSkew=Math.max(
    Math.abs(top-bottom)/Math.max(top,bottom,1),
    Math.abs(left-right)/Math.max(left,right,1),
  );
  const completeness=assessCardCompleteness([tl,tr,br,bl],width,height);
  const plausible=convex&&aspect>=1.42&&aspect<=1.95&&coverage>=0.08&&coverage<=0.88&&maxAngleCos<=0.48&&oppositeSkew<=0.48;
  if(!plausible)return {confidence:0,coverage,aspect,plausible:false,completeness:completeness.score,boundaryTouch:completeness.boundaryTouch,maxAngleCos,oppositeSkew};
  const aspectScore=clamp(1-Math.abs(aspect-1.667)/0.32,0,1);
  const coverageScore=coverage<0.16?clamp((coverage-0.08)/0.08,0,1):coverage>0.82?clamp((0.88-coverage)/0.06,0,1):1;
  const angleScore=clamp(1-maxAngleCos/0.48,0,1);
  const skewScore=clamp(1-oppositeSkew/0.48,0,1);
  const edgeSupport=clamp(Number(evidence.edgeSupport ?? 0.75),0,1);
  const confidence=clamp(
    aspectScore*0.22+coverageScore*0.14+angleScore*0.18+skewScore*0.12+completeness.score*0.18+edgeSupport*0.16,
    0,1,
  );
  return {
    confidence:Number(confidence.toFixed(3)),coverage,aspect,plausible:true,
    completeness:completeness.score,boundaryTouch:completeness.boundaryTouch,maxAngleCos,oppositeSkew,
    horizontal:cardWidth,vertical:cardHeight,
  };
}

function grayscale(imageData){
  const {data,width,height}=imageData,result=new Uint8Array(width*height);
  for(let index=0,pixel=0;index<data.length;index+=4,pixel++)result[pixel]=Math.round(data[index]*0.299+data[index+1]*0.587+data[index+2]*0.114);
  return result;
}
function blur3(source,width,height){
  const output=new Uint8Array(source.length);
  for(let y=1;y<height-1;y++)for(let x=1;x<width-1;x++){
    let sum=0;
    for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)sum+=source[(y+dy)*width+x+dx];
    output[y*width+x]=Math.round(sum/9);
  }
  return output;
}
function sobelEdges(gray,width,height){
  const smoothed=blur3(gray,width,height),magnitude=new Float32Array(gray.length),values=[];
  for(let y=2;y<height-2;y++)for(let x=2;x<width-2;x++){
    const i=y*width+x;
    const gx=-smoothed[i-width-1]-2*smoothed[i-1]-smoothed[i+width-1]+smoothed[i-width+1]+2*smoothed[i+1]+smoothed[i+width+1];
    const gy=-smoothed[i-width-1]-2*smoothed[i-width]-smoothed[i-width+1]+smoothed[i+width-1]+2*smoothed[i+width]+smoothed[i+width+1];
    const value=Math.hypot(gx,gy);magnitude[i]=value;
    if((x+y)%3===0)values.push(value);
  }
  const threshold=clamp(percentile(values,0.82),38,150),mask=new Uint8Array(gray.length),points=[];
  const stride=Math.max(1,Math.round(Math.sqrt((width*height)/350000)));
  for(let y=3;y<height-3;y+=stride)for(let x=3;x<width-3;x+=stride){
    const i=y*width+x;if(magnitude[i]>=threshold){mask[i]=1;points.push({x,y});}
  }
  return {mask,points,threshold};
}
function thinPoints(points,maxPoints=10000){
  if(points.length<=maxPoints)return points;
  const step=points.length/maxPoints,result=[];
  for(let index=0;index<maxPoints;index++)result.push(points[Math.floor(index*step)]);
  return result;
}
function houghLines(points,width,height){
  const sampled=thinPoints(points),thetaStep=2,thetaCount=90,diag=Math.hypot(width,height),rhoBin=4,rhoCount=Math.ceil((diag*2)/rhoBin)+1;
  const acc=new Uint16Array(thetaCount*rhoCount),cosines=new Float32Array(thetaCount),sines=new Float32Array(thetaCount);
  for(let ti=0;ti<thetaCount;ti++){const theta=radians(ti*thetaStep);cosines[ti]=Math.cos(theta);sines[ti]=Math.sin(theta);}
  for(const point of sampled){
    for(let ti=0;ti<thetaCount;ti++){
      const rho=point.x*cosines[ti]+point.y*sines[ti],ri=Math.round((rho+diag)/rhoBin);
      const index=ti*rhoCount+ri;if(acc[index]<65535)acc[index]++;
    }
  }
  const peaks=[];
  for(let ti=0;ti<thetaCount;ti++)for(let ri=1;ri<rhoCount-1;ri++){
    const votes=acc[ti*rhoCount+ri];if(votes<10)continue;
    peaks.push({theta:ti*thetaStep,rho:ri*rhoBin-diag,votes});
  }
  peaks.sort((a,b)=>b.votes-a.votes);
  const selected=[];
  for(const peak of peaks){
    if(selected.some((line)=>angleDistance(line.theta,peak.theta)<5&&Math.abs(line.rho-peak.rho)<12))continue;
    selected.push(peak);if(selected.length>=22)break;
  }
  return selected;
}
function lineIntersection(a,b){
  const aTheta=radians(a.theta),bTheta=radians(b.theta),ac=Math.cos(aTheta),as=Math.sin(aTheta),bc=Math.cos(bTheta),bs=Math.sin(bTheta),det=ac*bs-as*bc;
  if(Math.abs(det)<1e-5)return null;
  return {x:(a.rho*bs-as*b.rho)/det,y:(ac*b.rho-a.rho*bc)/det};
}
function sampleEdgeSupport(mask,width,height,a,b){
  const length=distance(a,b),steps=Math.max(20,Math.min(180,Math.round(length/3))),radius=2;let hits=0;
  for(let step=0;step<=steps;step++){
    const t=step/steps,x=Math.round(a.x+(b.x-a.x)*t),y=Math.round(a.y+(b.y-a.y)*t);let hit=false;
    for(let dy=-radius;dy<=radius&&!hit;dy++)for(let dx=-radius;dx<=radius;dx++){
      const xx=x+dx,yy=y+dy;if(xx>=0&&xx<width&&yy>=0&&yy<height&&mask[yy*width+xx]){hit=true;break;}
    }
    if(hit)hits++;
  }
  return hits/(steps+1);
}
function quadEdgeSupport(mask,width,height,points){
  return points.reduce((sum,point,index)=>sum+sampleEdgeSupport(mask,width,height,point,points[(index+1)%4]),0)/4;
}
function insideBounds(point,width,height,pad=0.04){return point&&point.x>=-width*pad&&point.x<=width*(1+pad)&&point.y>=-height*pad&&point.y<=height*(1+pad);}

export function detectCardQuad(imageData){
  const {width,height}=imageData;if(width<100||height<100)return null;
  const gray=grayscale(imageData),edges=sobelEdges(gray,width,height),lines=houghLines(edges.points,width,height);
  if(lines.length<4)return null;
  const minDim=Math.min(width,height),pairs=[];
  for(let i=0;i<lines.length;i++)for(let j=i+1;j<lines.length;j++){
    const angle=angleDistance(lines[i].theta,lines[j].theta),separation=Math.abs(lines[i].rho-lines[j].rho);
    if(angle<=10&&separation>=minDim*0.16&&separation<=Math.hypot(width,height)*0.92)pairs.push({a:lines[i],b:lines[j],theta:(lines[i].theta+lines[j].theta)/2,weight:lines[i].votes+lines[j].votes});
  }
  pairs.sort((a,b)=>b.weight-a.weight);const limited=pairs.slice(0,30),candidates=[];
  for(let i=0;i<limited.length;i++)for(let j=i+1;j<limited.length;j++){
    const perpendicular=Math.abs(angleDistance(limited[i].theta,limited[j].theta)-90);if(perpendicular>18)continue;
    const raw=[
      lineIntersection(limited[i].a,limited[j].a),lineIntersection(limited[i].a,limited[j].b),
      lineIntersection(limited[i].b,limited[j].b),lineIntersection(limited[i].b,limited[j].a),
    ];
    if(raw.some((point)=>!insideBounds(point,width,height)))continue;
    const points=orderQuad(raw),edgeSupport=quadEdgeSupport(edges.mask,width,height,points),metrics=evaluateCardQuad(points,width,height,{edgeSupport});
    if(!metrics.plausible||edgeSupport<0.34)continue;
    const score=metrics.confidence*0.72+edgeSupport*0.28;
    candidates.push({...metrics,points,edgeSupport:Number(edgeSupport.toFixed(3)),confidence:Number(clamp(score,0,1).toFixed(3)),strategy:'edge-hough-v2'});
  }
  candidates.sort((a,b)=>b.confidence-a.confidence||b.coverage-a.coverage);
  const best=candidates[0];
  if(!best||best.confidence<0.58)return null;
  return best;
}

export function expandCardQuad(points,width,height,padding=0.018){
  if(!Array.isArray(points)||points.length!==4||!width||!height)return points;
  const center=points.reduce((sum,point)=>({x:sum.x+point.x/4,y:sum.y+point.y/4}),{x:0,y:0});
  return points.map((point)=>({
    x:clamp(center.x+(point.x-center.x)*(1+padding*2),0,width-1),
    y:clamp(center.y+(point.y-center.y)*(1+padding*2),0,height-1),
  }));
}

function solveLinear(matrix,vector){
  const size=vector.length,a=matrix.map((row,index)=>[...row,vector[index]]);
  for(let col=0;col<size;col++){
    let pivot=col;for(let row=col+1;row<size;row++)if(Math.abs(a[row][col])>Math.abs(a[pivot][col]))pivot=row;
    if(Math.abs(a[pivot][col])<1e-10)return null;[a[col],a[pivot]]=[a[pivot],a[col]];
    const divisor=a[col][col];for(let j=col;j<=size;j++)a[col][j]/=divisor;
    for(let row=0;row<size;row++){if(row===col)continue;const factor=a[row][col];for(let j=col;j<=size;j++)a[row][j]-=factor*a[col][j];}
  }
  return a.map((row)=>row[size]);
}
export function perspectiveCoefficients(points){
  const ordered=orderQuad(points),matrix=[],vector=[],target=[[0,0],[1,0],[1,1],[0,1]];
  for(let index=0;index<4;index++){
    const [u,v]=target[index],{x,y}=ordered[index];
    matrix.push([u,v,1,0,0,0,-x*u,-x*v]);vector.push(x);
    matrix.push([0,0,0,u,v,1,-y*u,-y*v]);vector.push(y);
  }
  return solveLinear(matrix,vector);
}
export function warpPerspective(source,points,targetWidth,targetHeight){
  const coefficients=perspectiveCoefficients(points);if(!coefficients)return null;
  const output=document.createElement('canvas');output.width=targetWidth;output.height=targetHeight;
  const inputContext=source.getContext('2d',{willReadFrequently:true}),input=inputContext.getImageData(0,0,source.width,source.height),context=output.getContext('2d'),result=context.createImageData(targetWidth,targetHeight);
  for(let y=0;y<targetHeight;y++)for(let x=0;x<targetWidth;x++){
    const u=targetWidth<=1?0:x/(targetWidth-1),v=targetHeight<=1?0:y/(targetHeight-1),den=coefficients[6]*u+coefficients[7]*v+1;
    const sx=(coefficients[0]*u+coefficients[1]*v+coefficients[2])/den,sy=(coefficients[3]*u+coefficients[4]*v+coefficients[5])/den;
    const x0=clamp(Math.floor(sx),0,source.width-1),y0=clamp(Math.floor(sy),0,source.height-1),x1=clamp(x0+1,0,source.width-1),y1=clamp(y0+1,0,source.height-1),fx=clamp(sx-x0,0,1),fy=clamp(sy-y0,0,1);
    const out=(y*targetWidth+x)*4;
    for(let channel=0;channel<4;channel++){
      const p00=input.data[(y0*source.width+x0)*4+channel],p10=input.data[(y0*source.width+x1)*4+channel],p01=input.data[(y1*source.width+x0)*4+channel],p11=input.data[(y1*source.width+x1)*4+channel];
      result.data[out+channel]=Math.round((p00*(1-fx)+p10*fx)*(1-fy)+(p01*(1-fx)+p11*fx)*fy);
    }
  }
  context.putImageData(result,0,0);return output;
}

function assessQuality(imageData){
  const gray=grayscale(imageData),sample=[],highlights=[];let sum=0,sumSq=0,lapSum=0,lapSq=0,lapCount=0;
  const step=Math.max(1,Math.round(Math.sqrt(gray.length/120000)));
  for(let y=1;y<imageData.height-1;y+=step)for(let x=1;x<imageData.width-1;x+=step){
    const i=y*imageData.width+x,value=gray[i];sample.push(value);sum+=value;sumSq+=value*value;highlights.push(value>=248?1:0);
    const lap=4*value-gray[i-1]-gray[i+1]-gray[i-imageData.width]-gray[i+imageData.width];lapSum+=lap;lapSq+=lap*lap;lapCount++;
  }
  const count=Math.max(1,sample.length),mean=sum/count,variance=Math.max(0,sumSq/count-mean*mean),contrast=Math.sqrt(variance),lapMean=lapSum/Math.max(1,lapCount),lapVariance=Math.max(0,lapSq/Math.max(1,lapCount)-lapMean*lapMean),glare=highlights.reduce((a,b)=>a+b,0)/count;
  const brightnessScore=clamp(100-Math.abs(mean-160)*0.7,0,100),contrastScore=clamp(contrast*2.2,0,100),blurScore=clamp(Math.sqrt(lapVariance)*3.2,0,100),glareScore=clamp(100-glare*500,0,100);
  const overall=Math.round(brightnessScore*0.28+contrastScore*0.2+blurScore*0.34+glareScore*0.18);
  return {overall,blur:Math.round(blurScore),brightness:Math.round(brightnessScore),glare:Math.round(glareScore),coverage:100};
}
function gentleEnhance(canvas){
  const context=canvas.getContext('2d',{willReadFrequently:true}),image=context.getImageData(0,0,canvas.width,canvas.height),data=image.data,luminance=[];
  const stride=Math.max(4,Math.floor(data.length/4/50000));
  for(let pixel=0;pixel<data.length/4;pixel+=stride){const offset=pixel*4;luminance.push(data[offset]*0.299+data[offset+1]*0.587+data[offset+2]*0.114);}
  const low=percentile(luminance,0.03),high=percentile(luminance,0.97),range=Math.max(40,high-low),gain=clamp(205/range,0.92,1.10),mid=(low+high)/2,offset=clamp(150-mid*gain,-10,10);
  if(Math.abs(gain-1)<0.015&&Math.abs(offset)<2)return canvas;
  for(let index=0;index<data.length;index+=4)for(let channel=0;channel<3;channel++)data[index+channel]=clamp(Math.round(data[index+channel]*gain+offset),0,255);
  context.putImageData(image,0,0);return canvas;
}
function canvasBlob(canvas,quality=0.9){return new Promise((resolve)=>canvas.toBlob(resolve,'image/webp',quality));}
async function bitmapFromFile(file){
  if(typeof createImageBitmap==='function')return createImageBitmap(file);
  return new Promise((resolve,reject)=>{
    const image=new Image(),url=URL.createObjectURL(file);
    image.onload=()=>{URL.revokeObjectURL(url);resolve(image);};image.onerror=()=>{URL.revokeObjectURL(url);reject(new Error('名片圖片讀取失敗'));};image.src=url;
  });
}
function normalizedCorners(points,width,height){return points.map((point)=>({x:clamp(point.x/width,0,1),y:clamp(point.y/height,0,1)}));}

export async function processBusinessCardImage(file){
  if(!(file instanceof Blob)||!file.size)throw new Error('找不到名片圖片');
  const bitmap=await bitmapFromFile(file),sourceWidth=bitmap.width||bitmap.naturalWidth,sourceHeight=bitmap.height||bitmap.naturalHeight;
  if(!sourceWidth||!sourceHeight)throw new Error('無法讀取名片圖片尺寸');
  const maxAnalysis=960,scale=Math.min(1,maxAnalysis/Math.max(sourceWidth,sourceHeight)),analysisWidth=Math.max(120,Math.round(sourceWidth*scale)),analysisHeight=Math.max(120,Math.round(sourceHeight*scale));
  const analysisCanvas=document.createElement('canvas');analysisCanvas.width=analysisWidth;analysisCanvas.height=analysisHeight;const analysisContext=analysisCanvas.getContext('2d',{willReadFrequently:true});analysisContext.drawImage(bitmap,0,0,analysisWidth,analysisHeight);
  const analysisImage=analysisContext.getImageData(0,0,analysisWidth,analysisHeight),quality=assessQuality(analysisImage),found=detectCardQuad(analysisImage);
  const baseMetadata={
    original:{width:sourceWidth,height:sourceHeight},
    detection:{detected:Boolean(found),confidence:Number(found?.confidence||0)},
    card:{orientation:'',rotation:0},quality,
    processing:{perspectiveCorrected:false,cropped:false,rotated:false,lightingEnhanced:false,manualCorrection:false},
    corners:found?normalizedCorners(found.points,analysisWidth,analysisHeight):[],warning:'',
  };
  if(!found){
    return {file:null,metadata:{...baseMetadata,warning:'未能可靠找到名片四邊，請手動裁切；不會呼叫 AI 進行裁切。'}};
  }
  const completeness=assessCardCompleteness(found.points,analysisWidth,analysisHeight);
  if(completeness.boundaryTouch||completeness.score<CARD_IMAGE_THRESHOLDS.completeness){
    return {file:null,metadata:{...baseMetadata,detection:{detected:true,confidence:Math.min(found.confidence,0.69)},warning:'名片可能未完整入鏡或貼近照片邊界，請重新拍攝或手動裁切。'}};
  }
  if(found.confidence<CARD_IMAGE_THRESHOLDS.confidence){
    return {file:null,metadata:{...baseMetadata,warning:'已找到可能的名片邊界，但信心不足；請確認或手動裁切。'}};
  }
  const sourceCanvas=document.createElement('canvas');sourceCanvas.width=sourceWidth;sourceCanvas.height=sourceHeight;sourceCanvas.getContext('2d',{willReadFrequently:true}).drawImage(bitmap,0,0,sourceWidth,sourceHeight);
  const sourcePoints=expandCardQuad(found.points,analysisWidth,analysisHeight).map((point)=>({x:point.x/scale,y:point.y/scale}));
  const ordered=orderQuad(sourcePoints),widthEstimate=(distance(ordered[0],ordered[1])+distance(ordered[3],ordered[2]))/2,heightEstimate=(distance(ordered[0],ordered[3])+distance(ordered[1],ordered[2]))/2,landscape=widthEstimate>=heightEstimate;
  const aspect=Math.max(widthEstimate,heightEstimate)/Math.max(1,Math.min(widthEstimate,heightEstimate)),longSide=1600,shortSide=Math.round(longSide/clamp(aspect,1.42,1.95)),targetWidth=landscape?longSide:shortSide,targetHeight=landscape?shortSide:longSide;
  const warped=warpPerspective(sourceCanvas,ordered,targetWidth,targetHeight);if(!warped)return {file:null,metadata:{...baseMetadata,warning:'透視補正失敗，請改用手動裁切。'}};
  gentleEnhance(warped);const blob=await canvasBlob(warped,0.9);if(!blob)return {file:null,metadata:{...baseMetadata,warning:'裁切圖片輸出失敗，請改用手動裁切。'}};
  const output=new File([blob],'business-card-auto.webp',{type:'image/webp'}),orientation=landscape?'landscape':'portrait';
  return {file:output,metadata:{
    ...baseMetadata,
    detection:{detected:true,confidence:found.confidence},
    card:{orientation,rotation:0},
    quality:{...quality,coverage:Math.round(found.coverage*100)},
    processing:{perspectiveCorrected:true,cropped:true,rotated:false,lightingEnhanced:true,manualCorrection:false},
    corners:normalizedCorners(found.points,analysisWidth,analysisHeight),warning:'',
  }};
}
