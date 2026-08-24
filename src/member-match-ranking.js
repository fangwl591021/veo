const ANALYSIS_VERSION='business-partner-v1';
const MAX_BATCH=5;
const text=(value,max=1000)=>String(value || '').trim().slice(0,max);

const SCORE_SCHEMA={
  type:'object',
  additionalProperties:false,
  required:['score','reason'],
  properties:{
    score:{type:'integer',minimum:0,maximum:100},
    reason:{type:'string',minLength:8,maxLength:80},
  },
};

function parseJson(value,fallback={}) {
  try { return JSON.parse(value || '') || fallback; } catch { return fallback; }
}

export function memberMatchFromVersions(value='') {
  const source=typeof value==='string' ? parseJson(value,{}) : value || {};
  const match=source._memberMatch || {};
  return {
    status:['queued','processing','ready','failed'].includes(match.status) ? match.status : 'pending',
    score:Math.max(0,Math.min(100,Math.round(Number(match.score) || 0))),
    rank:Math.max(0,Math.round(Number(match.rank) || 0)),
    reason:text(match.reason,120),
    analysisVersion:text(match.analysisVersion,40),
    memberInsightsUpdatedAt:text(match.memberInsightsUpdatedAt,80),
    updatedAt:text(match.updatedAt,80),
  };
}

function contactInsights(row={}) {
  const versions=parseJson(row.versions_json,{});
  const insight=versions._crmInsights || {};
  return {
    status:insight.status || '',
    cards:insight.cards && typeof insight.cards==='object' ? insight.cards : {},
  };
}

function outputText(result={}) {
  return result.output_text || result.output?.flatMap((item)=>item.content || []).find((item)=>item.type==='output_text')?.text || '';
}

async function callAiResponses(provider,body) {
  if(!provider)throw new Error('MLM AI 服務尚未連線');
  const internal=typeof provider!=='string';
  const response=internal
    ? await provider.fetch('https://mlm.internal/api/internal/ai/responses',{
      method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({request:body}),
    })
    : await fetch('https://api.openai.com/v1/responses',{
      method:'POST',headers:{authorization:`Bearer ${provider}`,'content-type':'application/json'},body:JSON.stringify(body),
    });
  const result=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(result?.error?.message || result?.error || 'MLM AI 服務暫時無法使用');
  return result;
}

export function normaliseBusinessPartnerScore(value={}) {
  return {
    score:Math.max(0,Math.min(100,Math.round(Number(value.score) || 0))),
    reason:text(value.reason,120),
  };
}

async function scoreContact(provider,model,memberCards,row) {
  const contact=contactInsights(row);
  const member={
    personality:text(memberCards.personality,220),
    interests:text(memberCards.interests,220),
    career:text(memberCards.career,220),
  };
  const candidate={
    name:text(row.display_name,120),
    company:text(row.company_name,180),
    title:text(row.job_title,120),
    department:text(row.department,120),
    service:text(row.service_description,500),
    industry:memberMatchIndustry(row),
    personality:text(contact.cards.personality,220),
    interests:text(contact.cards.interests,220),
    career:text(contact.cards.career,220),
  };
  const result=await callAiResponses(provider,{
    model:model || 'gpt-5.6-terra',
    reasoning:{effort:'low'},
    max_output_tokens:300,
    input:[{role:'user',content:`你是繁體中文商務夥伴配對顧問。請評估目前會員與這位收藏聯絡人的「事業夥伴綜合契合度」。

目前會員：${JSON.stringify(member)}
候選聯絡人：${JSON.stringify(candidate)}

評分規則：
1. 商務服務與資源互補 40%、工作及決策風格互補 35%、興趣與人脈協作潛力 25%。
2. 只依提供的公司、職稱、服務、行業及個性／興趣／事業標籤評估。
3. 不使用健康、疾病、財富、宗教、政治等敏感資訊。
4. 資料不足時保守評分，不得捏造經歷、客戶、財力或合作成果。
5. score 為 0 至 100 的整數；reason 用 15 至 40 個繁體中文字說明具體合作依據。
只回傳指定 JSON。`}],
    text:{format:{type:'json_schema',name:'business_partner_score',strict:true,schema:SCORE_SCHEMA}},
  });
  const raw=outputText(result);
  if(!raw)throw new Error('AI 未回傳配對分數');
  return normaliseBusinessPartnerScore(JSON.parse(raw));
}

function memberMatchIndustry(row={}) {
  const industry=parseJson(row.versions_json,{})._industry || {};
  return [industry.primary,...(Array.isArray(industry.secondary) ? industry.secondary : [])].filter(Boolean).join('、');
}

async function writeMatch(db,userId,id,match) {
  await db.prepare(`UPDATE contact_cards
    SET versions_json=json_set(COALESCE(NULLIF(versions_json,''),'{}'),'$._memberMatch',json(?))
    WHERE id=? AND scanner_user_id=? AND status='active'`)
    .bind(JSON.stringify(match),id,userId).run();
}

export async function queueMemberMatchRankingRefresh(db,userId,force=false,contactId='') {
  const member=await db.prepare("SELECT status,updated_at FROM member_crm_insights WHERE platform_user_id=?").bind(userId).first();
  if(member?.status!=='ready')return 0;
  const rows=await db.prepare("SELECT id,versions_json FROM contact_cards WHERE scanner_user_id=? AND status='active' ORDER BY updated_at ASC LIMIT 100").bind(userId).all();
  const now=Date.now();
  const targets=(rows.results || []).filter((row)=>{
    if(contactId && row.id!==contactId)return false;
    if(contactInsights(row).status!=='ready')return false;
    const match=memberMatchFromVersions(row.versions_json);
    if(!force && ['queued','processing'].includes(match.status) && (!match.updatedAt || Date.parse(match.updatedAt)>now-5*60*1000))return false;
    if(!force && match.status==='failed' && match.updatedAt && Date.parse(match.updatedAt)>now-10*60*1000)return false;
    return force || match.status!=='ready' || match.analysisVersion!==ANALYSIS_VERSION || match.memberInsightsUpdatedAt!==member.updated_at;
  }).slice(0,MAX_BATCH);
  if(!targets.length)return 0;
  const updatedAt=new Date().toISOString();
  await db.batch(targets.map((row)=>db.prepare(`UPDATE contact_cards
    SET versions_json=json_set(COALESCE(NULLIF(versions_json,''),'{}'),'$._memberMatch',json(?))
    WHERE id=? AND scanner_user_id=? AND status='active'`).bind(JSON.stringify({
      ...memberMatchFromVersions(row.versions_json),
      status:'queued',
      analysisVersion:ANALYSIS_VERSION,
      memberInsightsUpdatedAt:member.updated_at,
      updatedAt,
    }),row.id,userId)));
  return targets.length;
}

export async function processMemberMatchRankings(db,userId,provider,model) {
  const member=await db.prepare("SELECT status,insights_json,updated_at FROM member_crm_insights WHERE platform_user_id=?").bind(userId).first();
  if(member?.status!=='ready')return {processed:0,ranked:0};
  const memberCards=parseJson(member.insights_json,{});
  const result=await db.prepare("SELECT * FROM contact_cards WHERE scanner_user_id=? AND status='active' ORDER BY created_at ASC LIMIT 100").bind(userId).all();
  const rows=result.results || [];
  const targets=rows.filter((row)=>contactInsights(row).status==='ready' && memberMatchFromVersions(row.versions_json).status==='queued').slice(0,MAX_BATCH);
  if(!targets.length)return {processed:0,ranked:rows.filter((row)=>memberMatchFromVersions(row.versions_json).status==='ready').length};

  const processingAt=new Date().toISOString();
  await db.batch(targets.map((row)=>db.prepare(`UPDATE contact_cards
    SET versions_json=json_set(COALESCE(NULLIF(versions_json,''),'{}'),'$._memberMatch',json(?))
    WHERE id=? AND scanner_user_id=? AND status='active'`).bind(JSON.stringify({
      ...memberMatchFromVersions(row.versions_json),
      status:'processing',
      updatedAt:processingAt,
    }),row.id,userId)));

  const scored=await Promise.all(targets.map(async(row)=>{
    try {
      const value=await scoreContact(provider,model,memberCards,row);
      return {id:row.id,match:{...value,status:'ready',rank:0,analysisVersion:ANALYSIS_VERSION,memberInsightsUpdatedAt:member.updated_at,updatedAt:new Date().toISOString()}};
    } catch(error) {
      console.error('Business partner ranking failed',row.id,error);
      return {id:row.id,match:{status:'failed',score:0,rank:0,reason:text(error.message || '配對分析失敗',120),analysisVersion:ANALYSIS_VERSION,memberInsightsUpdatedAt:member.updated_at,updatedAt:new Date().toISOString()}};
    }
  }));
  for(const item of scored)await writeMatch(db,userId,item.id,item.match);

  const refreshed=await db.prepare("SELECT id,created_at,versions_json FROM contact_cards WHERE scanner_user_id=? AND status='active' ORDER BY created_at ASC LIMIT 100").bind(userId).all();
  const rankable=(refreshed.results || []).map((row)=>({row,match:memberMatchFromVersions(row.versions_json)}))
    .filter((item)=>item.match.status==='ready')
    .sort((a,b)=>b.match.score-a.match.score || String(a.row.created_at).localeCompare(String(b.row.created_at)) || String(a.row.id).localeCompare(String(b.row.id)));
  if(rankable.length)await db.batch(rankable.map((item,index)=>db.prepare(`UPDATE contact_cards
    SET versions_json=json_set(COALESCE(NULLIF(versions_json,''),'{}'),'$._memberMatch.rank',?,'$._memberMatch.updatedAt',?)
    WHERE id=? AND scanner_user_id=? AND status='active'`).bind(index+1,new Date().toISOString(),item.row.id,userId)));
  return {processed:targets.length,ranked:rankable.length};
}
