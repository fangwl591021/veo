import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

test("system settings exposes independent Gemini and OpenAI key controls", () => {
  for (const html of [read("../public/admin.html"), read("../public/admin/index.html")]) {
    assert.match(html, /id="geminiSettingsPanel"/);
    assert.match(html, /id="geminiAPIKey" type="password"/);
    assert.match(html, /id="saveGeminiKey"/);
    assert.match(html, /id="testGeminiSetting"/);
    assert.match(html, /id="deleteGeminiKey"/);
    assert.match(html, /id="openAIKey" type="password"/);
    assert.doesNotMatch(html, /GEMINI_API_KEY 必須使用 Wrangler Secret/);
  }
});

test("Gemini key is encrypted in D1 and never returned by status APIs", () => {
  const settings = read("../src/gemini-settings.js");
  const worker = read("../src/index.js");
  const migration = read("../migrations/10002_gemini_settings.sql");
  assert.match(settings, /AES-GCM/);
  assert.match(settings, /api_key_ciphertext/);
  assert.match(settings, /masked:`••••\$\{row\.api_key_last4\}`/);
  assert.doesNotMatch(settings, /return \{[^}]*apiKey/);
  assert.match(worker, /resolveGeminiKey\(env\.DB, env\.SESSION_SIGNING_SECRET, env\.GEMINI_API_KEY\)/);
  assert.match(worker, /\/v1\/admin\/gemini-settings/);
  assert.match(worker, /admin\.gemini_key\.updated/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS gemini_api_settings/);
});

test("Gemini settings endpoints require system access", () => {
  const worker = read("../src/index.js");
  assert.match(worker, /startsWith\("\/v1\/admin\/gemini-settings"\)[\s\S]*!admin\.adminAccess\.systemAccess/);
  const admin = read("../public/admin.js");
  assert.match(admin, /geminiSettings\.hidden = !adminAccess\?\.systemAccess/);
});
