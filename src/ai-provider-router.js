const DEFAULT_GEMINI_MODEL="gemini-3.5-flash-lite";
const DEFAULT_OPENAI_MODEL="gpt-5-mini";
const clean=(value,max=160)=>String(value||"").trim().slice(0,max);
const number=(value)=>Math.max(0,Number(value)||0);

function featureFromRequest(body={}){
  const name=clean(body?.text?.format?.name,80).toLowerCase();
  if(name.includes("business_card")||name.includes("contact_data"))return "card_ocr";
  if(name.includes("crm")||name.includes("insight"))return "crm_analysis";
  if(name.includes("match"))return "smart_matching";
  if(name.includes("task"))return "task_engine";
  return name||"general";
}
function inputParts(body={}){
  const parts=[];
  for(const item of Array.isArray(body.input)?body.input:[]){
    const content=Array.isArray(item?.content)?item.content:[item?.content];
    for(const part of content){
      if(typeof part==="string")parts.push({text:part});
      else if(part?.type==="input_text"&&part.text)parts.push({text:String(part.text)});
      else if(part?.type==="input_image"&&part.image_url){const match=String(part.image_url).match(/^data:([^;,]+);base64,(.+)$/s);if(match)parts.push({inlineData:{mimeType:match[1],data:match[2]}})}
    }
  }
  return parts;
}
function geminiRequest(body={}){
  const generationConfig={maxOutputTokens:number(body.max_output_tokens)||2048};
  const schema=body?.text?.format?.schema;
  if(schema){generationConfig.responseMimeType="application/json";generationConfig.responseJsonSchema=schema}
  const request={contents:[{role:"user",parts:inputParts(body)}],generationConfig};
  if((body.tools||[]).some((tool)=>tool?.type==="web_search"))request.tools=[{googleSearch:{}}];
  return request;
}
const responseText=(result={})=>(result.candidates||[]).flatMap((candidate)=>candidate?.content?.parts||[]).map((part)=>part?.text||"").join("").trim();
function providerError(message,{code="provider_error",status=0,retryable=true}={}){const error=new Error(message);error.code=code;error.status=status;error.retryable=retryable;return error}
const safeErrorCode=(error)=>clean(error?.code||(error?.status?`http_${error.status}`:"request_failed"),80).replace(/[^a-zA-Z0-9_.-]/g,"_");
async function logUsage(db,event){
  if(!db?.prepare)return;
  try{await db.prepare(`INSERT INTO ai_usage_events (id,request_id,platform_user_id,feature,provider,model,attempt,is_fallback,status,http_status,input_tokens,output_tokens,total_tokens,cached_tokens,reasoning_tokens,latency_ms,error_code) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(crypto.randomUUID(),event.requestId,clean(event.userId,120),clean(event.feature,80),event.provider,clean(event.model,120),event.attempt,event.attempt>1?1:0,event.status,number(event.httpStatus),number(event.inputTokens),number(event.outputTokens),number(event.totalTokens),number(event.cachedTokens),number(event.reasoningTokens),number(event.latencyMs),clean(event.errorCode,80)).run()}catch(error){console.error("AI usage logging failed",{code:safeErrorCode(error)})}
}
async function callGemini(fetchImpl,apiKey,model,body){
  if(!apiKey)throw providerError("Gemini API Key 尚未設定",{code:"missing_key"});
  const response=await fetchImpl(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,{method:"POST",headers:{"content-type":"application/json","x-goog-api-key":apiKey},body:JSON.stringify(geminiRequest(body))});
  const result=await response.json().catch(()=>({}));
  if(!response.ok){const status=response.status;throw providerError(result?.error?.message||"Gemini 服務暫時無法使用",{status,code:`http_${status}`,retryable:true})}
  if(result?.promptFeedback?.blockReason)throw providerError("Gemini 安全政策拒絕此內容",{code:"safety_blocked",retryable:false});
  const text=responseText(result);if(!text)throw providerError("Gemini 未回傳內容",{code:"empty_response"});
  if(body?.text?.format?.schema){try{JSON.parse(text)}catch{throw providerError("Gemini 回傳格式不完整",{code:"invalid_json"})}}
  const usage=result.usageMetadata||{};
  return {result:{output_text:text,output:[{type:"message",content:[{type:"output_text",text}]}],model:result.modelVersion||model,usage:{input_tokens:number(usage.promptTokenCount),output_tokens:number(usage.candidatesTokenCount),total_tokens:number(usage.totalTokenCount)}},usage:{inputTokens:usage.promptTokenCount,outputTokens:usage.candidatesTokenCount,totalTokens:usage.totalTokenCount,cachedTokens:usage.cachedContentTokenCount,reasoningTokens:usage.thoughtsTokenCount}};
}
async function callOpenAI(fetchImpl,apiKey,model,body){
  if(!apiKey)throw providerError("OpenAI API Key 尚未設定",{code:"missing_key",retryable:false});
  const response=await fetchImpl("https://api.openai.com/v1/responses",{method:"POST",headers:{authorization:`Bearer ${apiKey}`,"content-type":"application/json"},body:JSON.stringify({...body,model:model||body.model})});
  const result=await response.json().catch(()=>({}));if(!response.ok)throw providerError(result?.error?.message||"OpenAI 服務暫時無法使用",{status:response.status,code:`http_${response.status}`,retryable:false});
  const usage=result.usage||{};return {result,usage:{inputTokens:usage.input_tokens,outputTokens:usage.output_tokens,totalTokens:usage.total_tokens,cachedTokens:usage.input_tokens_details?.cached_tokens,reasoningTokens:usage.output_tokens_details?.reasoning_tokens}};
}
async function runAttempt({db,requestId,userId,feature,provider,model,attempt,operation}){
  const started=Date.now();
  try{const value=await operation();await logUsage(db,{requestId,userId,feature,provider,model,attempt,status:"success",latencyMs:Date.now()-started,...value.usage});return value.result}
  catch(error){await logUsage(db,{requestId,userId,feature,provider,model,attempt,status:error?.code==="safety_blocked"?"blocked":"failed",httpStatus:error?.status,latencyMs:Date.now()-started,errorCode:safeErrorCode(error)});throw error}
}
export function createAiProviderRouter({db,geminiApiKey="",openaiApiKey="",geminiModel=DEFAULT_GEMINI_MODEL,openaiModel=DEFAULT_OPENAI_MODEL,userId="",fallbackService=null,fetchImpl=fetch}={}){
  return {async fetch(requestUrl,init={}){
    if(!String(requestUrl||"").includes("/responses")&&fallbackService?.fetch)return fallbackService.fetch(requestUrl,init);
    const envelope=JSON.parse(String(init.body||"{}")),body=envelope.request||envelope,requestId=crypto.randomUUID(),feature=featureFromRequest(body);
    let geminiError;
    try{const result=await runAttempt({db,requestId,userId,feature,provider:"gemini",model:geminiModel,attempt:1,operation:()=>callGemini(fetchImpl,geminiApiKey,geminiModel,body)});return Response.json(result)}
    catch(error){geminiError=error;if(error?.retryable===false)return Response.json({error:{message:error.message,code:safeErrorCode(error)}},{status:error.status||400})}
    try{const result=await runAttempt({db,requestId,userId,feature,provider:"openai",model:openaiModel,attempt:2,operation:()=>callOpenAI(fetchImpl,openaiApiKey,openaiModel,body)});return Response.json(result)}
    catch(error){return Response.json({error:{message:error.message||geminiError?.message||"AI 服務暫時無法使用",code:safeErrorCode(error)}},{status:error.status||503})}
  }};
}
export async function getAiUsageReport(db,{from="",to="",provider="",feature="",limit=50}={}){
  const filters=["1=1"],binds=[];
  if(from){filters.push("created_at>=?");binds.push(from)}if(to){filters.push("created_at<?");binds.push(to)}if(["gemini","openai"].includes(provider)){filters.push("provider=?");binds.push(provider)}if(feature){filters.push("feature=?");binds.push(clean(feature,80))}
  const where=filters.join(" AND ");
  const summary=await db.prepare(`SELECT COUNT(DISTINCT request_id) logical_requests,COUNT(*) provider_attempts,SUM(CASE WHEN status='success' THEN 1 ELSE 0 END) successful_attempts,SUM(CASE WHEN is_fallback=1 THEN 1 ELSE 0 END) fallback_attempts,SUM(input_tokens) input_tokens,SUM(output_tokens) output_tokens,SUM(total_tokens) total_tokens,ROUND(AVG(latency_ms)) average_latency_ms FROM ai_usage_events WHERE ${where}`).bind(...binds).first();
  const byProvider=await db.prepare(`SELECT provider,COUNT(*) attempts,SUM(CASE WHEN status='success' THEN 1 ELSE 0 END) successes,SUM(total_tokens) total_tokens,ROUND(AVG(latency_ms)) average_latency_ms FROM ai_usage_events WHERE ${where} GROUP BY provider ORDER BY attempts DESC`).bind(...binds).all();
  const events=await db.prepare(`SELECT request_id,feature,provider,model,attempt,is_fallback,status,http_status,input_tokens,output_tokens,total_tokens,latency_ms,error_code,created_at FROM ai_usage_events WHERE ${where} ORDER BY created_at DESC LIMIT ?`).bind(...binds,Math.max(1,Math.min(number(limit)||50,200))).all();
  return {summary:summary||{},byProvider:byProvider.results||[],events:events.results||[]};
}
export async function testGeminiConnection(apiKey,model=DEFAULT_GEMINI_MODEL,fetchImpl=fetch){if(!apiKey)throw new Error("GEMINI_API_KEY 尚未設定");const response=await fetchImpl(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}`,{headers:{"x-goog-api-key":apiKey}});if(!response.ok)throw new Error(`Gemini 連線失敗（HTTP ${response.status}）`);return {configured:true,source:"environment",model}}
export function getGeminiKeyStatus(apiKey="",model=DEFAULT_GEMINI_MODEL){return {configured:Boolean(String(apiKey||"").trim()),source:String(apiKey||"").trim()?"environment":"none",model}}
