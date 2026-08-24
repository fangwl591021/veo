import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createAiProviderRouter } from "./src/ai-provider-router.js";

const wrangler = readFileSync(new URL("./wrangler.jsonc", import.meta.url), "utf8");

function usageDb(events) {
  return {
    prepare(sql) {
      assert.match(sql, /INSERT INTO ai_usage_events/);
      return {
        bind(...values) {
          return { async run() { events.push(values); } };
        },
      };
    },
  };
}

function requestBody() {
  return {
    input: [{ role: "user", content: [{ type: "input_text", text: "private prompt" }] }],
    text: { format: { name: "contact_data", schema: { type: "object", properties: { name: { type: "string" } } } } },
  };
}

test("Gemini is primary and records one sanitized usage event", async () => {
  const events = [];
  const calls = [];
  const router = createAiProviderRouter({
    db: usageDb(events), geminiApiKey: "gemini-secret", openaiApiKey: "openai-secret", userId: "user-1",
    fetchImpl: async (url, init) => {
      calls.push({ url, init });
      return Response.json({ candidates: [{ content: { parts: [{ text: '{"name":"A"}' }] } }], usageMetadata: { promptTokenCount: 7, candidatesTokenCount: 3, totalTokenCount: 10 } });
    },
  });
  const response = await router.fetch("https://mlm.invalid/v1/responses", { body: JSON.stringify(requestBody()) });
  assert.equal(response.status, 200);
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /generativelanguage\.googleapis\.com\/v1beta\/models\/gemini-3\.5-flash-lite:generateContent/);
  assert.equal(calls[0].init.headers["x-goog-api-key"], "gemini-secret");
  assert.equal(events.length, 1);
  assert.equal(events[0][4], "gemini");
  assert.equal(events[0][8], "success");
  assert.equal(events[0][12], 10);
  assert.equal(JSON.stringify(events).includes("private prompt"), false);
  assert.equal(JSON.stringify(events).includes("gemini-secret"), false);
});

test("Wrangler production config uses the same Gemini Flash-Lite model", () => {
  assert.match(wrangler, /"GEMINI_MODEL": "gemini-3\.5-flash-lite"/);
});

test("OpenAI is used only after Gemini fails", async () => {
  const events = [];
  const calls = [];
  const router = createAiProviderRouter({
    db: usageDb(events), geminiApiKey: "gemini-secret", openaiApiKey: "openai-secret",
    fetchImpl: async (url, init) => {
      calls.push({ url, init });
      if (url.includes("googleapis.com")) return Response.json({ error: { message: "quota" } }, { status: 429 });
      return Response.json({ output_text: '{"name":"B"}', usage: { input_tokens: 8, output_tokens: 4, total_tokens: 12 } });
    },
  });
  const response = await router.fetch("https://mlm.invalid/v1/responses", { body: JSON.stringify(requestBody()) });
  assert.equal(response.status, 200);
  assert.equal(calls.length, 2);
  assert.equal(calls[1].url, "https://api.openai.com/v1/responses");
  assert.equal(calls[1].init.headers.authorization, "Bearer openai-secret");
  assert.equal(JSON.parse(calls[1].init.body).model, "gpt-5-mini");
  assert.deepEqual(events.map((event) => [event[4], event[7], event[8]]), [["gemini", 0, "failed"], ["openai", 1, "success"]]);
});

test("Gemini safety block is returned without bypassing to OpenAI", async () => {
  const events = [];
  let calls = 0;
  const router = createAiProviderRouter({
    db: usageDb(events), geminiApiKey: "gemini-secret", openaiApiKey: "openai-secret",
    fetchImpl: async () => { calls += 1; return Response.json({ promptFeedback: { blockReason: "SAFETY" } }); },
  });
  const response = await router.fetch("https://mlm.invalid/v1/responses", { body: JSON.stringify(requestBody()) });
  assert.equal(response.status, 400);
  assert.equal(calls, 1);
  assert.deepEqual(events.map((event) => [event[4], event[8]]), [["gemini", "blocked"]]);
});
