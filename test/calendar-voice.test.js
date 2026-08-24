import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  parseCalendarVoice,
  transcribeCalendarVoice,
  validateCalendarVoiceAudio,
} from "../src/calendar-voice.js";

test("voice transcription enforces the 15 second limit", () => {
  const file = new File([new Uint8Array([1, 2, 3])], "voice.webm", { type:"audio/webm" });
  assert.throws(() => validateCalendarVoiceAudio(file, 15_001), /最多 15 秒/);
});

test("voice transcription forwards multipart audio through the MLM binding", async () => {
  const file = new File([new Uint8Array([1, 2, 3])], "voice.webm", { type:"audio/webm" });
  let forwarded;
  const provider = { fetch: async (url, options) => {
    forwarded = { url, method:options.method, form:await new Response(options.body).formData() };
    return Response.json({ text:"明天下午兩點跟王小姐開會" });
  } };
  const transcript = await transcribeCalendarVoice(provider, file, 9_500);
  assert.equal(transcript, "明天下午兩點跟王小姐開會");
  assert.equal(forwarded.url, "https://mlm.internal/api/internal/ai/transcriptions");
  assert.equal(forwarded.method, "POST");
  assert.equal(forwarded.form.get("durationMs"), "9500");
  assert.equal(forwarded.form.get("file").type, "audio/webm");
});

test("AI proposal maps existing labels and contacts without saving an event", async () => {
  const provider = { fetch: async (_url, options) => {
    const request = JSON.parse(options.body).request;
    assert.equal(request.text.format.name, "calendar_voice_event");
    return Response.json({ output_text:JSON.stringify({
      title:"與王小姐開會",
      startsAt:"2026-07-28T14:00:00+08:00",
      endsAt:"2026-07-28T15:00:00+08:00",
      location:"台北辦公室",
      description:"討論合作方案",
      labelName:"約訪",
      contactName:"王小美",
      reminderMinutes:30,
      confidence:0.92,
      needsConfirmation:false,
    }) });
  } };
  const result = await parseCalendarVoice(provider, "明天下午兩點跟王小美開會", {
    labels:[{ id:"label-visit", name:"約訪", sourceType:"custom" }],
    contacts:[{ id:"card-wang", displayName:"王小美", companyName:"示範公司", jobTitle:"經理" }],
  }, new Date("2026-07-27T08:00:00.000Z"));
  assert.equal(result.proposal.labelId, "label-visit");
  assert.equal(result.proposal.contactId, "card-wang");
  assert.equal(result.proposal.startsAt, "2026-07-28T06:00:00.000Z");
  assert.equal(result.proposal.needsConfirmation, false);
});

test("calendar UI records at most 15 seconds and fills an AI draft", async () => {
  const source = await readFile(new URL("../public/app.js", import.meta.url), "utf8");
  assert.match(source, /navigator\.mediaDevices\.getUserMedia/);
  assert.match(source, /new MediaRecorder/);
  assert.match(source, /setTimeout\(\(\)=>\{if\(recorder\?\.state==="recording"\)recorder\.stop\(\);\},15_000\)/);
  assert.match(source, /\/v1\/personal-calendar\/voice/);
  assert.match(source, /AI 已整理草稿/);
});