const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);

function gray(imageData){
  const out=new Uint8Array(imageData.width*imageData.height),d=imageData.data;
  for(let i=0,p=0;i<d.length;i+=4,p++)out[p]=Math.round(d[i]*.299+d[i+1]*.587+d[i+2]*.114);
  return out;
}
function percentile(values,r){
  if(!values.length)return 0;const sorted=[...values].sort((a,b)=>a-b);return sorted[Math.min(sorted.length-1,Math.floor((sorted.length-1)*r))];
}

function activityMap(gray,width,height){
  const strength=new Uint8Array(gray.length),samples=[];
  for(let y=2;y<height-2;y++)for(let x=2;x<width-2;x++){
    const i=y*width+x;
    const gx=Math.abs(gray[i-1]-gray[i+1])+Math.abs(gray[i-width-1]-gray[i-width+1])+Math.abs(gray[i+width-1]-gray[i+width+1]);
    const gy=Math.abs(gray[i-width]-gray[i+width])+Math.abs(gray[i-width-1]-gray[i+width-1])+Math.abs(gray[i-width+1]-gray[i+width+1]);
    const value=Math.min(255,Math.round((gx+gy)/3));
    if((x+y)%9===0)samples.push(value);
    strength[i]=value;
  }
  const threshold=clamp(percentile(samples,.76),18,58),mask=new Uint8Array(gray.length);
  for(let i=0;i<strength.length;i++)if(strength[i]>=threshold)mask[i]=1;
  return {mask,strength,threshold};
}

function smooth1d(values,radius){
  const out=new Float32Array(values.length),prefix=new Float64Array(values.length+1);
  for(let i=0;i<values.length;i++)prefix[i+1]=prefix[i]+values[i];
  for(let i=0;i<values.length;i++){
    const a=Math.max(0,i-radius),b=Math.min(values.length,i+radius+1);
    out[i]=(prefix[b]-prefix[a])/(b-a);
  }
  return out;
}

function textBands(mask,width,height){
  const rows=new Float32Array(height);
  for(let y=0;y<height;y++){
    let hits=0,runs=0,inRun=false;
    for(let x=0;x<width;x++){
      const on=mask[y*width+x]===1;
      if(on){hits++;if(!inRun){runs++;inRun=true;}}
      else inRun=false;
    }
    rows[y]=(hits/Math.max(1,width))*.45+Math.min(1,runs/28)*.55;
  }
  const smoothed=smooth1d(rows,Math.max(2,Math.round(height*.004)));
  const samples=[...smoothed].filter(v=>v>0),cut=clamp(percentile(samples,.58),.025,.16);
  const bands=[];let start=-1,peak=0;
  for(let y=0;y<=height;y++){
    const active=y<height&&smoothed[y]>=cut;
    if(active&&start<0){start=y;peak=smoothed[y];}
    else if(active)peak=Math.max(peak,smoothed[y]);
    else if(start>=0){
      const end=y-1,h=end-start+1;
      if(h>=2&&h<=height*.12)bands.push({start,end,peak,height:h});
      start=-1;peak=0;
    }
  }
  return bands;
}

function bandHorizontalExtent(mask,width,height,band){
  const cols=new Uint16Array(width);
  for(let y=band.start;y<=band.end;y++)for(let x=0;x<width;x++)if(mask[y*width+x])cols[x]++;
  const threshold=Math.max(1,Math.floor(band.height*.12));
  let minX=width,maxX=-1;
  for(let x=0;x<width;x++)if(cols[x]>=threshold){minX=Math.min(minX,x);maxX=Math.max(maxX,x);}
  return maxX>=minX?{minX,maxX,width:maxX-minX+1}:null;
}

function clusterBands(mask,width,height,bands){
  const enriched=bands.map(b=>({...b,...(bandHorizontalExtent(mask,width,height,b)||{})})).filter(b=>Number.isFinite(b.minX)&&b.width>=width*.04);
  if(enriched.length<2)return null;
  const groups=[];let current=[];
  for(const band of enriched.sort((a,b)=>a.start-b.start)){
    if(!current.length){current=[band];continue;}
    const last=current[current.length-1],gap=band.start-last.end;
    if(gap<=height*.065)current.push(band);
    else{if(current.length>=2)groups.push(current);current=[band];}
  }
  if(current.length>=2)groups.push(current);
  if(!groups.length)return null;
  const scored=groups.map(group=>{
    const minX=Math.min(...group.map(b=>b.minX)),maxX=Math.max(...group.map(b=>b.maxX)),minY=group[0].start,maxY=group[group.length-1].end;
    const w=maxX-minX+1,h=maxY-minY+1,spreadX=w/width,spreadY=h/height,rowCount=group.length,peak=group.reduce((s,b)=>s+b.peak,0)/rowCount;
    const score=Math.min(1,rowCount/6)*.38+clamp(spreadX/.55,0,1)*.30+clamp(spreadY/.26,0,1)*.20+clamp(peak/.35,0,1)*.12;
    return {minX,minY,maxX,maxY,width:w,height:h,rowCount,score};
  }).filter(g=>g.width>=width*.18&&g.height>=height*.055);
  scored.sort((a,b)=>b.score-a.score);
  if(!scored.length)return null;
  const primary={...scored[0]};
  for(const g of scored.slice(1)){
    const overlap=Math.max(0,Math.min(primary.maxX,g.maxX)-Math.max(primary.minX,g.minX));
    const overlapRatio=overlap/Math.max(1,Math.min(primary.width,g.width));
    const gap=Math.max(0,Math.max(primary.minY-g.maxY,g.minY-primary.maxY));
    if(overlapRatio>=.28&&gap<=height*.13){
      primary.minX=Math.min(primary.minX,g.minX);primary.maxX=Math.max(primary.maxX,g.maxX);
      primary.minY=Math.min(primary.minY,g.minY);primary.maxY=Math.max(primary.maxY,g.maxY);
      primary.width=primary.maxX-primary.minX+1;primary.height=primary.maxY-primary.minY+1;primary.rowCount+=g.rowCount;
    }
  }
  return primary;
}

function contentBoundaryRisk(box,width,height){
  const marginX=width*.026,marginY=height*.026;
  const sides={left:box.minX<=marginX,right:box.maxX>=width-marginX,top:box.minY<=marginY,bottom:box.maxY>=height-marginY};
  const clipped=Object.values(sides).some(Boolean);
  return {clipped,sides,marginRatio:{left:box.minX/width,right:(width-box.maxX)/width,top:box.minY/height,bottom:(height-box.maxY)/height}};
}

function buildAsymmetricCandidates(box,width,height){
  const candidates=[],targetAspect=1.667;
  const leftPads=[.035,.06,.09,.13],rightPads=[.035,.06,.10,.15,.21],topPads=[.035,.06,.10,.15],bottomPads=[.04,.07,.11,.16,.22];
  let clippedAttempts=0,totalAttempts=0;
  for(const lp of leftPads)for(const rp of rightPads)for(const tp of topPads)for(const bp of bottomPads){
    totalAttempts++;
    const left=box.minX-width*lp,right=box.maxX+width*rp,top=box.minY-height*tp,bottom=box.maxY+height*bp;
    if(left<1||top<1||right>=width-1||bottom>=height-1){clippedAttempts++;continue;}
    let w=right-left,h=bottom-top;if(w<=0||h<=0)continue;
    const current=w/h;let l=left,r=right,t=top,b=bottom;
    if(current<targetAspect){
      const need=h*targetAspect-w,leftRoom=l,rightRoom=width-r,total=Math.max(1,leftRoom+rightRoom),addL=need*(leftRoom/total),addR=need-addL;l-=addL;r+=addR;
    }else if(current>targetAspect){
      const need=w/targetAspect-h,topRoom=t,bottomRoom=height-b,total=Math.max(1,topRoom+bottomRoom),addT=need*(topRoom/total),addB=need-addT;t-=addT;b+=addB;
    }
    if(l<1||t<1||r>=width-1||b>=height-1){clippedAttempts++;continue;}
    const cardArea=(r-l)*(b-t),contentArea=box.width*box.height,occupancy=contentArea/Math.max(1,cardArea);
    if(occupancy<.12||occupancy>.72)continue;
    candidates.push({points:[{x:l,y:t},{x:r,y:t},{x:r,y:b},{x:l,y:b}],contentOccupancy:occupancy,orientation:'landscape'});
  }
  return {candidates,clippedAttemptRatio:clippedAttempts/Math.max(1,totalAttempts)};
}

function edgeEvidence(imageData,points){
  const {width,height}=imageData,g=gray(imageData);let total=0,hits=0;
  for(let e=0;e<4;e++){
    const a=points[e],b=points[(e+1)%4],steps=Math.max(30,Math.min(180,Math.round(distance(a,b)/3)));
    for(let s=0;s<=steps;s++){
      const t=s/steps,x=Math.round(a.x+(b.x-a.x)*t),y=Math.round(a.y+(b.y-a.y)*t);let best=0;
      for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++){
        const xx=x+dx,yy=y+dy;if(xx<=0||yy<=0||xx>=width-1||yy>=height-1)continue;const i=yy*width+xx;
        best=Math.max(best,Math.abs(g[i-1]-g[i+1]),Math.abs(g[i-width]-g[i+width]));
      }
      total++;if(best>=24)hits++;
    }
  }
  return hits/Math.max(1,total);
}
function surfaceScore(imageData,points){
  const {width,height,data}=imageData,xs=points.map(p=>p.x),ys=points.map(p=>p.y),minX=Math.max(0,Math.floor(Math.min(...xs))),maxX=Math.min(width-1,Math.ceil(Math.max(...xs))),minY=Math.max(0,Math.floor(Math.min(...ys))),maxY=Math.min(height-1,Math.ceil(Math.max(...ys)));
  const cells=[];for(let gy=0;gy<4;gy++)for(let gx=0;gx<6;gx++){
    let sum=0,count=0;const x0=Math.floor(minX+(maxX-minX)*gx/6),x1=Math.floor(minX+(maxX-minX)*(gx+1)/6),y0=Math.floor(minY+(maxY-minY)*gy/4),y1=Math.floor(minY+(maxY-minY)*(gy+1)/4);
    for(let y=y0;y<y1;y+=3)for(let x=x0;x<x1;x+=3){const i=(y*width+x)*4;sum+=data[i]*.299+data[i+1]*.587+data[i+2]*.114;count++;}
    cells.push(sum/Math.max(1,count));
  }
  const mean=cells.reduce((a,b)=>a+b,0)/cells.length,variance=cells.reduce((s,v)=>s+(v-mean)**2,0)/cells.length;
  return clamp(1-Math.sqrt(variance)/95,0,1);
}

export function detectTextGuidedCard(imageData){
  const {width,height}=imageData;if(width<180||height<180)return null;
  const g=gray(imageData),activity=activityMap(g,width,height),bands=textBands(activity.mask,width,height),contentBox=clusterBands(activity.mask,width,height,bands);
  if(!contentBox)return null;
  const boundaryRisk=contentBoundaryRisk(contentBox,width,height);
  const built=buildAsymmetricCandidates(contentBox,width,height);
  if(boundaryRisk.clipped||(!built.candidates.length&&built.clippedAttemptRatio>.45)){
    return {
      points:[{x:Math.max(0,contentBox.minX),y:Math.max(0,contentBox.minY)},{x:Math.min(width-1,contentBox.maxX),y:Math.max(0,contentBox.minY)},{x:Math.min(width-1,contentBox.maxX),y:Math.min(height-1,contentBox.maxY)},{x:Math.max(0,contentBox.minX),y:Math.min(height-1,contentBox.maxY)}],
      confidence:.99,
      coverage:(contentBox.width*contentBox.height)/(width*height),
      strategy:'text-guided-v2.4.2-clipped',
      advisory:true,
      incompleteFrame:true,
      clippedSides:boundaryRisk.sides,
      contentBox:{...contentBox,threshold:activity.threshold,bandCount:bands.length},
      contentDensity:1,
      contentFit:0,
      surfaceConsistency:0,
      edgeSupport:0,
    };
  }
  const candidates=built.candidates.map(c=>{
    const edge=edgeEvidence(imageData,c.points),surface=surfaceScore(imageData,c.points),occupancyScore=clamp(1-Math.abs(c.contentOccupancy-.36)/.30,0,1),rowScore=clamp(contentBox.rowCount/7,0,1),confidence=clamp(.34*occupancyScore+.28*edge+.20*surface+.18*rowScore,0,1);
    return {...c,edgeSupport:Number(edge.toFixed(3)),surfaceConsistency:Number(surface.toFixed(3)),contentDensity:Number(c.contentOccupancy.toFixed(3)),contentFit:Number(occupancyScore.toFixed(3)),confidence:Number(confidence.toFixed(3)),coverage:(c.points[1].x-c.points[0].x)*(c.points[3].y-c.points[0].y)/(width*height),strategy:'text-guided-v2.4.2',contentBox:{...contentBox,threshold:activity.threshold,bandCount:bands.length}};
  });
  candidates.sort((a,b)=>b.confidence-a.confidence||b.edgeSupport-a.edgeSupport);
  const best=candidates[0];
  return best&&best.confidence>=.58?best:null;
}
