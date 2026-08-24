import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");

const app = source("public/app.js");
const css = source("public/akaffit.css");
const start = app.indexOf("async function home()");
const end = app.indexOf("async function legacyHome()", start);
const home = app.slice(start, end);

test("home member summary preserves profile, wallet, and exclusive sharing actions", () => {
  assert.match(home, /class="ak-member-summary"/);
  assert.match(home, /data-home-action="profile"/);
  assert.match(home, /data-home-action="wallet"/);
  assert.match(home, /data-home-action="share"/);
  assert.match(home, /\$\{format\(wallet\.balance\)\}/);
  assert.match(home, /專屬分享/);
  assert.match(home, /id="shareQr"/);
  assert.match(home, /id="shareInviteUrl"/);
  assert.match(home, /id="copyInvite"/);
  assert.doesNotMatch(home, /商脈指數|商脈點數|ak-hero|ak-index-card|ak-meter/);
  assert.match(css, /\.ak-member-summary\{[^}]*background:var\(--ak-cream\)/);
  assert.match(css, /\.ak-member-actions\{display:grid;grid-template-columns:repeat\(4/);
  assert.match(home, /class="ak-profile-card" data-home-action="profile"[\s\S]*<span>我的<\/span>/);
  assert.match(home, /class="ak-destiny-card" data-home-action="zodiacPopup"[\s\S]*<span>星座命理<\/span>/);
});

test("home omits the greeting and centers the profile in the brand row", () => {
  assert.doesNotMatch(app, /function homeGreeting/);
  assert.match(home, /class="ak-member-brand-row"[\s\S]*class="ak-wordmark"[\s\S]*class="ak-member-avatar"[\s\S]*class="ak-task-notice/);
});
