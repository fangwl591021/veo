import { readFileSync, writeFileSync } from 'node:fs';

const paths=['public/app-20260815-132.js'];

const replacement=`async function cropByVisionLocalization(file,rawLocalization){
  const localization=normalizedVisionLocalization(rawLocalization);
  if(!file||!localization.detected||localization.incomplete||localization.cropConfidence<0.72)return null;
  const bitmap=await createImageBitmap(file,{imageOrientation:'from-image'}).catch(()=>createImageBitmap(file));
  try{
    const scale=Math.min(1,2200/Math.max(bitmap.width,bitmap.height));
    const source=document.createElement('canvas');
    source.width=Math.max(1,Math.round(bitmap.width*scale));
    source.height=Math.max(1,Math.round(bitmap.height*scale));
    source.getContext('2d',{alpha:false}).drawImage(bitmap,0,0,source.width,source.height);

    const b=localization.boundingBox;
    if(b.width<0.08||b.height<0.05)return null;
    const padX=b.width*.015,padY=b.height*.015;
    const left=Math.max(0,b.x-padX),top=Math.max(0,b.y-padY),right=Math.min(1,b.x+b.width+padX),bottom=Math.min(1,b.y+b.height+padY);
    const bx=Math.round(left*source.width),by=Math.round(top*source.height),bw=Math.round((right-left)*source.width),bh=Math.round((bottom-top)*source.height);
    if(bw<80||bh<50)return null;

    let output=null;
    if(localization.corners.length===4){
      const rawPoints=orderQuad(localization.corners.map(p=>({x:p.x*source.width,y:p.y*source.height})));
      const xs=rawPoints.map(p=>p.x/source.width),ys=rawPoints.map(p=>p.y/source.height);
      const cornerBox={x:Math.min(...xs),y:Math.min(...ys),width:Math.max(...xs)-Math.min(...xs),height:Math.max(...ys)-Math.min(...ys)};
      const intersectionLeft=Math.max(b.x,cornerBox.x),intersectionTop=Math.max(b.y,cornerBox.y);
      const intersectionRight=Math.min(b.x+b.width,cornerBox.x+cornerBox.width),intersectionBottom=Math.min(b.y+b.height,cornerBox.y+cornerBox.height);
      const intersection=Math.max(0,intersectionRight-intersectionLeft)*Math.max(0,intersectionBottom-intersectionTop);
      const union=b.width*b.height+cornerBox.width*cornerBox.height-intersection;
      const boxIou=union>0?intersection/union:0;
      const boxCenter={x:b.x+b.width/2,y:b.y+b.height/2};
      const cornerCenter={x:cornerBox.x+cornerBox.width/2,y:cornerBox.y+cornerBox.height/2};
      const centerDelta=Math.hypot(boxCenter.x-cornerCenter.x,boxCenter.y-cornerCenter.y);
      const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
      const widthEstimate=(dist(rawPoints[0],rawPoints[1])+dist(rawPoints[3],rawPoints[2]))/2;
      const heightEstimate=(dist(rawPoints[0],rawPoints[3])+dist(rawPoints[1],rawPoints[2]))/2;
      const rawRatio=widthEstimate/Math.max(1,heightEstimate);
      const boxRatio=(b.width*source.width)/Math.max(1,b.height*source.height);
      const ratioAgreement=Math.max(rawRatio,boxRatio)/Math.max(.001,Math.min(rawRatio,boxRatio));
      const cardLikeRatio=(rawRatio>=1.20&&rawRatio<=2.15)||(rawRatio>=0.46&&rawRatio<=0.83);
      const cornersAgreeWithBox=boxIou>=0.72&&centerDelta<=0.06&&ratioAgreement<=1.22&&cardLikeRatio&&Math.min(widthEstimate,heightEstimate)>=80;

      if(cornersAgreeWithBox){
        const center=rawPoints.reduce((acc,p)=>({x:acc.x+p.x/4,y:acc.y+p.y/4}),{x:0,y:0});
        const points=rawPoints.map(p=>({
          x:Math.max(0,Math.min(source.width-1,center.x+(p.x-center.x)*1.025)),
          y:Math.max(0,Math.min(source.height-1,center.y+(p.y-center.y)*1.025)),
        }));
        const ratio=Math.max(.45,Math.min(2.2,rawRatio));
        const long=Math.min(1600,Math.max(1,Math.round(Math.max(widthEstimate,heightEstimate))));
        const width=ratio>=1?long:Math.max(1,Math.round(long*ratio));
        const height=ratio>=1?Math.max(1,Math.round(long/ratio)):long;
        output=warpPerspective(source,points,width,height);
      }
    }

    if(!output){
      output=document.createElement('canvas');
      output.width=bw;output.height=bh;
      output.getContext('2d',{alpha:false}).drawImage(source,bx,by,bw,bh,0,0,bw,bh);
    }
    const blob=await new Promise(resolve=>output.toBlob(resolve,'image/webp',.9));
    return blob?new File([blob],'business-card-vision-crop.webp',{type:'image/webp'}):null;
  }finally{bitmap.close?.();}
}`;

for(const path of paths){
  let source=readFileSync(path,'utf8');
  const start=source.indexOf('async function cropByVisionLocalization(file,rawLocalization){');
  const end=source.indexOf('\nasync function prepareCardLiff()',start);
  if(start<0||end<0)throw new Error('cropByVisionLocalization block not found in '+path);
  source=source.slice(0,start)+replacement+source.slice(end);
  writeFileSync(path,source);
}
