const MAX_AUDIO_BYTES = 1_500_000;
export const MAX_CALENDAR_VOICE_DURATION_MS = 15_000;
const ALLOWED_AUDIO_TYPES = new Set([
  "audio/webm",
  "audio/ogg",
  "audio/mp4",
  "audio/mpeg",
  "audio/wav",
  "audio/x-m4a",
]);

const text = (value, max = 1000) => String(value || "").trim().slice(0, max);

const CALENDAR_VOICE_SCHEMA = {
  type:"object",
  additionalProperties:false,
  required:["title","startsAt","endsAt","location","description","labelName","contactName","reminderMinutes","confidence","needsConfirmation"],
  properties:{
    title:{type:"string"},
    startsAt:{type:"string"},
    endsAt:{type:"string"},
    location:{type:"string"},
    description:{type:"string"},
    labelName:{type:"string"},
    contactName:{type:"string"},
    reminderMinutes:{type:"integer",enum:[0,10,30,60,1440]},
    confidence:{type:"number",minimum:0,maximum:1},
    needsConfirmation:{type:"boolean"},
  },
};

function outputText(result = {}) {
  return result.output_text
    || result.output?.flatMap((item)=>item.content || []).find((item)=>item.type === "output_text")?.text
    || "";
}

export function validateCalendarVoiceAudio(file, durationMs) {
  if (!(file instanceof File) || !file.size) throw new Error("請錄製語音後再試");
  const duration = Number(durationMs);
  if (!Number.isFinite(duration) || duration <= 0 || duration > MAX_CALENDAR_VOICE_DURATION_MS) {
    throw new Error("語音長度最多 15 秒");
  }
  if (file.size > MAX_AUDIO_BYTES) throw new Error("語音檔案過大，請縮短後再試");
  const mime = text(file.type, 100).toLowerCase().split(";")[0];
  if (!ALLOWED_AUDIO_TYPES.has(mime)) throw new Error("不支援這個語音格式");
  return { durationMs:Math.round(duration), mime };
}

export async function transcribeCalendarVoice(provider, file, durationMs) {
  if (!provider || typeof provider.fetch !== "function") throw new Error("AI 語音服務尚未連線");
  const validated = validateCalendarVoiceAudio(file, durationMs);
  const form = new FormData();
  form.append("file", file, text(file.name, 120) || "calendar-voice.webm");
  form.append("durationMs", String(validated.durationMs));
  const response = await provider.fetch("https://mlm.internal/api/internal/ai/transcriptions", {
    method:"POST",
    body:form,
  });
  const result = await response.json().catch(()=>({}));
  if (!response.ok) throw new Error(text(result.error || result.message, 180) || "AI 語音辨識失敗");
  const transcript = text(result.text, 500);
  if (!transcript) throw new Error("沒有辨識到語音內容");
  return transcript;
}

export async function parseCalendarVoice(provider, transcript, context = {}, now = new Date()) {
  if (!provider || typeof provider.fetch !== "function") throw new Error("AI 行程解析服務尚未連線");
  const cleanTranscript = text(transcript, 500);
  if (!cleanTranscript) throw new Error("沒有可解析的語音文字");
  const labels = (Array.isArray(context.labels) ? context.labels : [])
    .filter((label)=>!["company","birthday"].includes(label.sourceType))
    .slice(0,40)
    .map((label)=>({id:text(label.id,100),name:text(label.name,20),sourceType:text(label.sourceType,30)}));
  const contacts = (Array.isArray(context.contacts) ? context.contacts : [])
    .slice(0,100)
    .map((contact)=>({id:text(contact.id,100),name:text(contact.displayName,120),company:text(contact.companyName,180),title:text(contact.jobTitle,120)}));
  const prompt = `你是繁體中文 AI 行事曆助理。請把使用者的 15 秒內語音逐字稿整理成行程草稿。

目前時間：${now.toISOString()}
時區：Asia/Taipei
逐字稿：${cleanTranscript}
可用分類：${JSON.stringify(labels.map((label)=>label.name))}
收藏名片：${JSON.stringify(contacts.map((contact)=>({name:contact.name,company:contact.company,title:contact.title})))}

規則：
1. title 必須簡短明確，不要包含日期時間；未能判斷時以逐字稿濃縮。
2. 相對時間（今天、明天、下週一）一律依 Asia/Taipei 與目前時間換算，startsAt、endsAt 回傳含 +08:00 的 ISO 8601。
3. 有開始時間但未說結束時間，預設 60 分鐘。
4. 日期或開始時間不明確時 startsAt、endsAt 都回傳空字串，needsConfirmation=true，不可猜測。
5. labelName 只能選可用分類名稱；約見人物優先選「約訪」，否則選最接近分類。
6. contactName 只有在收藏名片可明確對應時才填入完整姓名，否則空字串。
7. reminderMinutes 只能是 0、10、30、60、1440；未提提醒時為 60。
8. 不得捏造地點、人物或內容；所有結果仍需使用者確認。只回傳 JSON。`;
  const response = await provider.fetch("https://mlm.internal/api/internal/ai/responses", {
    method:"POST",
    headers:{"content-type":"application/json"},
    body:JSON.stringify({request:{
      model:"gpt-5-mini",
      reasoning:{effort:"low"},
      max_output_tokens:700,
      input:[{role:"user",content:prompt}],
      text:{format:{type:"json_schema",name:"calendar_voice_event",strict:true,schema:CALENDAR_VOICE_SCHEMA}},
    }}),
  });
  const result = await response.json().catch(()=>({}));
  if (!response.ok) throw new Error(text(result?.error?.message || result.error,180) || "AI 行程解析失敗");
  let parsed;
  try { parsed = JSON.parse(outputText(result)); }
  catch { throw new Error("AI 行程格式無法解析"); }
  const labelName = text(parsed.labelName,20);
  const label = labels.find((item)=>item.name === labelName) || labels.find((item)=>item.sourceType === "personal") || labels[0] || null;
  const contactName = text(parsed.contactName,120);
  const normalizedContactName = contactName.toLocaleLowerCase("zh-TW");
  const contact = contacts.find((item)=>item.name.toLocaleLowerCase("zh-TW") === normalizedContactName)
    || contacts.find((item)=>normalizedContactName && item.name.toLocaleLowerCase("zh-TW").includes(normalizedContactName))
    || null;
  const startsAt = text(parsed.startsAt,80);
  const endsAt = text(parsed.endsAt,80);
  const validRange = startsAt && endsAt && Number.isFinite(Date.parse(startsAt)) && Number.isFinite(Date.parse(endsAt)) && Date.parse(endsAt) > Date.parse(startsAt);
  return {
    transcript:cleanTranscript,
    proposal:{
      title:text(parsed.title,100) || cleanTranscript.slice(0,100),
      startsAt:validRange ? new Date(startsAt).toISOString() : "",
      endsAt:validRange ? new Date(endsAt).toISOString() : "",
      location:text(parsed.location,300),
      description:text(parsed.description,2000),
      labelId:label?.id || "",
      labelName:label?.name || "",
      contactId:contact?.id || "",
      contactName:contact?.name || "",
      reminderMinutes:[0,10,30,60,1440].includes(Number(parsed.reminderMinutes)) ? Number(parsed.reminderMinutes) : 0,
      confidence:Math.max(0,Math.min(1,Number(parsed.confidence) || 0)),
      needsConfirmation:Boolean(parsed.needsConfirmation) || !validRange,
    },
  };
}

export async function buildCalendarVoiceProposal(provider, file, durationMs, context, now = new Date()) {
  const transcript = await transcribeCalendarVoice(provider,file,durationMs);
  return parseCalendarVoice(provider,transcript,context,now);
}
