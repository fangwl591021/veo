import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { normalizeInvitePage } from "../src/member-invite-page.js";

test("normalizes member invite page copy and theme", () => {
  assert.deepEqual(normalizeInvitePage({
    roleTitle: "  AI 顧問  ",
    headline: "一起打開新的商務連結",
    tagline: "讓 AI 幫我們找到下一個合作機會。",
    ctaText: "開始探索",
    theme: "aurora",
  }), {
    roleTitle: "AI 顧問",
    headline: "一起打開新的商務連結",
    tagline: "讓 AI 幫我們找到下一個合作機會。",
    ctaText: "開始探索",
    theme: "aurora",
  });
  assert.equal(normalizeInvitePage({ theme: "unknown" }).theme, "cosmic");
  assert.equal(normalizeInvitePage({ headline: "字".repeat(120) }).headline.length, 90);
});

test("personal invite page APIs, editor, and visual styles are wired", () => {
  const worker = readFileSync(new URL("../src/index.js", import.meta.url), "utf8");
  const app = readFileSync(new URL("../public/app.js", import.meta.url), "utf8");
  const css = readFileSync(new URL("../public/styles.css", import.meta.url), "utf8");
  const migration = readFileSync(new URL("../migrations/0047_member_invite_pages.sql", import.meta.url), "utf8");

  assert.match(worker, /\/v1\/public\/invite-page/);
  assert.match(worker, /\/v1\/me\/invite-page\/background/);
  assert.match(app, /編輯我的 AI 邀請頁/);
  assert.match(app, /state\.invitePage/);
  assert.match(app, /data-invite-preview/);
  assert.match(css, /\.veo-entry-inviter/);
  assert.match(css, /\.invite-page-editor/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS member_invite_pages/);
});
