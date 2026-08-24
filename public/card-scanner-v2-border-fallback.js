const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);

function grayscale(imageData){
  const {data,width,height}=imageData,result=new Uint8Array(width*height);
  for(let offset=0,pixel=0;offset<data.length;offset+=4,pixel++)result[pixel]=Math.round(data[offset]*.299+data[offset+1]*.587+data[offset+2]*.114);
  return result;
}

function orientedEdges(gray,width,height){
  const horizontal=[],vertical=[],magnitude=new Float32Array(gray.length),samples=[];
  for(let y=2;y<height-2;y++)for(let x=2;x<width-2;x++){
    const i=y*width+x;
    const gx=-gray[i-width-1]-2*gray[i-1]-gray[i+width-1]+gray[i-width+1]+2*gray[i+1]+gray[i+width+1];
    const gy=-gray[i-width-1]-2*gray[i-width]-gray[i-width+1]+gray[i+width-1]+2*gray[i+width]+gray[i+width+1];
    const mag=Math.hypot(gx,gy);magnitude[i]=mag;
    if((x+y)%5===0)samples.push(mag);
  }
  samples.sort((a,b)=>a-b);
  const threshold=clamp(samples[Math.floor(samples.length*.82)]||42,42,145);
  const stride=Math.max(1,Math.round(Math.sqrt(width*height/280000)));
  for(let y=3;y<height-3;y+=stride)for(let x=3;x<width-3;x+=stride){
    const i=y*width+x,mag=magnitude[i];if(mag<threshold)continue;
    const gx=Math.abs(-gray[i-width-1]-2*gray[i-1]-gray[i+width-1]+gray[i-width+1]+2*gray[i+1]+gray[i+width+1]);
    const gy=Math.abs(-gray[i-width-1]-2*gray[i-width]-gray[i-width+1]+gray[i+width-1]+2*gray[i+width]+gray[i+width+1]);
    if(gy>=gx*1.15)horizontal.push({x,y,mag});
    if(gx>=gy*1.15)vertical.push({x,y,mag});
  }
  return {horizontal,vertical,magnitude,threshold};
}

function linePeaks(points,axisLength,otherLength,mode){
  const slopes=[];for(let m=-.24;m<=.2401;m+=.02)slopes.push(Number(m.toFixed(2)));
  const bin=4,all=[];
  for(const m of slopes){
    const bins=new Map();
    for(const point of points){
      const intercept=mode==='h'?point.y-m*point.x:point.x-m*point.y;
      const key=Math.round(intercept/bin),entry=bins.get(key)||{weight:0,min:Infinity,max:-Infinity,count:0};
      const along=mode==='h'?point.x:point.y;
      entry.weight+=Math.min(180,point.mag);entry.count++;entry.min=Math.min(entry.min,along);entry.max=Math.max(entry.max,along);bins.set(key,entry);
    }
    for(const [key,entry] of bins){
      const span=(entry.max-entry.min)/Math.max(1,axisLength);
      if(entry.count<12||span<.34)continue;
      all.push({m,b:key*bin,score:entry.weight*(.40+.60*span),span,count:entry.count});
    }
  }
  all.sort((a,b)=>b.score-a.score);
  const selected=[];
  for(const line of all){
    const center=line.m*(axisLength/2)+line.b;
    if(center<-otherLength*.05||center>otherLength*1.05)continue;
    if(selected.some((existing)=>Math.abs(existing.m-line.m)<.035&&Math.abs(existing.b-line.b)<14))continue;
    selected.push(line);if(selected.length>=20)break;
  }
  return selected;
}

function intersect(horizontal,vertical){
  const den=1-horizontal.m*vertical.m;if(Math.abs(den)<1e-5)return null;
  const x=(vertical.m*horizontal.b+vertical.b)/den;
  return {x,y:horizontal.m*x+horizontal.b};
}

function sampleSupport(magnitude,width,height,a,b){
  const steps=Math.max(30,Math.min(180,Math.round(distance(a,b)/4)));let hits=0;
  for(let step=0;step<=steps;step++){
    const t=step/steps,x=Math.round(a.x+(b.x-a.x)*t),y=Math.round(a.y+(b.y-a.y)*t);let best=0;
    for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++){
      const xx=x+dx,yy=y+dy;if(xx<0||xx>=width||yy<0||yy>=height)continue;
      best=Math.max(best,magnitude[yy*width+xx]);
    }
    if(best>=42)hits++;
  }
  return hits/(steps+1);
}

function geometry(points,width,height){
  const [tl,tr,br,bl]=points;
  if(points.some((p)=>!p||p.x<0||p.x>width||p.y<0||p.y>height))return null;
  const top=distance(tl,tr),bottom=distance(bl,br),left=distance(tl,bl),right=distance(tr,br);
  const w=(top+bottom)/2,h=(left+right)/2,aspect=Math.max(w,h)/Math.max(1,Math.min(w,h));
  const area=Math.abs(points.reduce((sum,p,index)=>{const q=points[(index+1)%4];return sum+p.x*q.y-p.y*q.x;},0))/2;
  const coverage=area/(width*height);
  const minMargin=Math.min(...points.flatMap((p)=>[p.x,p.y,width-p.x,height-p.y]))/Math.max(1,Math.min(width,height));
  if(aspect<1.38||aspect>2.02||coverage<.055||coverage>.88)return null;
  return {aspect,coverage,boundaryTouch:minMargin<.010,minMargin};
}

function quadPoint(points,u,v){
  const [tl,tr,br,bl]=points;
  return {
    x:(1-u)*(1-v)*tl.x+u*(1-v)*tr.x+u*v*br.x+(1-u)*v*bl.x,
    y:(1-u)*(1-v)*tl.y+u*(1-v)*tr.y+u*v*br.y+(1-u)*v*bl.y,
  };
}

function candidateContentEvidence(gray,magnitude,width,height,points,edgeThreshold){
  const cols=18,rows=11,occupied=[];const rowLight=Array(rows).fill(0),rowCounts=Array(rows).fill(0);
  let active=0,total=0;
  for(let row=0;row<rows;row++)for(let col=0;col<cols;col++){
    const u=(col+.5)/cols,v=(row+.5)/rows,p=quadPoint(points,u,v),x=Math.round(p.x),y=Math.round(p.y);
    if(x<2||x>=width-2||y<2||y>=height-2)continue;
    const index=y*width+x;
    let edge=0,light=0,count=0;
    for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++){
      const xx=x+dx,yy=y+dy;if(xx<0||xx>=width||yy<0||yy>=height)continue;
      edge+=magnitude[yy*width+xx];light+=gray[yy*width+xx];count++;
    }
    edge/=Math.max(1,count);light/=Math.max(1,count);total++;
    rowLight[row]+=light;rowCounts[row]++;
    const isActive=edge>=edgeThreshold*.72;
    if(isActive){active++;occupied.push({row,col});}
  }
  const rawDensity=active/Math.max(1,total);
  const contentDensity=clamp((rawDensity-.055)/.23,0,1);

  let contentFit=0;
  if(occupied.length>=4){
    const minRow=Math.min(...occupied.map((p)=>p.row)),maxRow=Math.max(...occupied.map((p)=>p.row));
    const minCol=Math.min(...occupied.map((p)=>p.col)),maxCol=Math.max(...occupied.map((p)=>p.col));
    const rowSpan=(maxRow-minRow+1)/rows,colSpan=(maxCol-minCol+1)/cols;
    const spread=Math.sqrt(rowSpan*colSpan);
    const centerPenalty=Math.abs((minRow+maxRow)/(2*(rows-1))-.5)*.28+Math.abs((minCol+maxCol)/(2*(cols-1))-.5)*.16;
    contentFit=clamp((spread-.34)/.52-centerPenalty,0,1);
  }

  const means=rowLight.map((sum,index)=>rowCounts[index]?sum/rowCounts[index]:0);
  const jumps=[];for(let i=1;i<means.length;i++)if(means[i]&&means[i-1])jumps.push(Math.abs(means[i]-means[i-1])/255);
  const maxJump=jumps.length?Math.max(...jumps):0;
  const meanJump=jumps.length?jumps.reduce((a,b)=>a+b,0)/jumps.length:0;
  const surfaceConsistency=clamp(1-(maxJump*.72+meanJump*.9),0,1);

  return {
    rawContentDensity:Number(rawDensity.toFixed(3)),
    contentDensity:Number(contentDensity.toFixed(3)),
    contentFit:Number(contentFit.toFixed(3)),
    surfaceConsistency:Number(surfaceConsistency.toFixed(3)),
  };
}

export function detectLongBorderQuad(imageData){
  const {width,height}=imageData;if(width<160||height<160)return null;
  const gray=grayscale(imageData),edges=orientedEdges(gray,width,height);
  if(edges.horizontal.length<30||edges.vertical.length<30)return null;
  const horizontal=linePeaks(edges.horizontal,width,height,'h');
  const vertical=linePeaks(edges.vertical,height,width,'v');
  const candidates=[];
  for(let hi=0;hi<horizontal.length;hi++)for(let hj=hi+1;hj<horizontal.length;hj++){
    const h1=horizontal[hi],h2=horizontal[hj];
    const y1=h1.m*(width/2)+h1.b,y2=h2.m*(width/2)+h2.b;
    if(Math.abs(y2-y1)<height*.11)continue;
    const top=y1<y2?h1:h2,bottom=y1<y2?h2:h1;
    for(let vi=0;vi<vertical.length;vi++)for(let vj=vi+1;vj<vertical.length;vj++){
      const v1=vertical[vi],v2=vertical[vj],x1=v1.m*(height/2)+v1.b,x2=v2.m*(height/2)+v2.b;
      if(Math.abs(x2-x1)<width*.16)continue;
      const left=x1<x2?v1:v2,right=x1<x2?v2:v1;
      const points=[intersect(top,left),intersect(top,right),intersect(bottom,right),intersect(bottom,left)];
      const g=geometry(points,width,height);if(!g)continue;
      const supports=points.map((point,index)=>sampleSupport(edges.magnitude,width,height,point,points[(index+1)%4]));
      const edgeSupport=supports.reduce((a,b)=>a+b,0)/4;
      if(edgeSupport<.24)continue;
      const evidence=candidateContentEvidence(gray,edges.magnitude,width,height,points,edges.threshold);
      // A border-only rectangle spanning laptop/desk surfaces must not win simply because its lines are long.
      if(evidence.rawContentDensity<.035||evidence.contentFit<.12||evidence.surfaceConsistency<.28)continue;
      const aspectScore=clamp(1-Math.abs(g.aspect-1.667)/.34,0,1);
      const spanScore=(Math.min(top.span,bottom.span)+Math.min(left.span,right.span))/2;
      const coverageScore=g.coverage<.10?clamp((g.coverage-.055)/.045,0,1):g.coverage>.55?clamp((.88-g.coverage)/.33,0,1):1;
      const confidence=clamp(
        edgeSupport*.24+
        aspectScore*.18+
        spanScore*.10+
        evidence.contentDensity*.18+
        evidence.contentFit*.15+
        evidence.surfaceConsistency*.10+
        coverageScore*.05,
        0,1,
      );
      candidates.push({...g,...evidence,points,edgeSupport:Number(edgeSupport.toFixed(3)),confidence:Number(confidence.toFixed(3)),strategy:'long-border-fallback-v2.3'});
    }
  }
  candidates.sort((a,b)=>b.confidence-a.confidence||b.contentFit-a.contentFit||b.rawContentDensity-a.rawContentDensity);
  const best=candidates[0];
  return best&&best.confidence>=.60?best:null;
}
