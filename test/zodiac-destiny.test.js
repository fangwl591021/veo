import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");

test("zodiac destiny popup exposes all requested analysis sources and today navigation", () => {
  const app = source("public/app.js");
  for (const label of ["西洋星座","東方生肖","紫微斗數","八字","生命靈數","MBTI","DISC","九型人格","Big Five","每日經文","每日智慧","AI 綜合分析"]) {
    assert.match(app, new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.match(app, /function lifePathFromBirthday/);
  assert.match(app, /data-destiny-ai/);
  assert.match(app, /AI 分析引擎/);
  assert.match(app, /今日導航卡/);
  assert.match(app, /不可僅憑生日推測人格類型/);
  assert.match(app, /需要出生時辰才能建立可靠命盤/);
  assert.match(app, /data-assessment-type/);
  assert.match(app, /function openPersonalityAssessment/);
  assert.match(app, /\/v1\/personality-assessments/);
  assert.match(app, /完成並儲存結果/);
});

test("destiny analysis API is authenticated and reuses the existing member AI engine", () => {
  const worker = source("src/index.js");
  assert.match(worker, /url\.pathname === "\/v1\/destiny-analysis"/);
  assert.match(worker, /const member = await currentMember\(request, env\)/);
  assert.match(worker, /getMemberCrmInsight\(env\.DB,member\.userId\)/);
  assert.match(worker, /scheduleMemberCrmInsights\(env,ctx,member\.userId\)/);
});

test("destiny popup remains scrollable and compact on phones", () => {
  const css = source("public/akaffit.css");
  assert.match(css, /\.destiny-source-grid\{[^}]*grid-template-columns:repeat\(2/);
  assert.match(css, /\.destiny-navigation\{[^}]*background:var\(--ak-deep\)/);
  assert.match(css, /@media\(max-width:390px\)[\s\S]*\.ak-zodiac-card\{max-height:calc\(100svh - 16px\)/);
  assert.match(css, /\.personality-assessment-dialog\{[^}]*position:fixed/);
  assert.match(css, /\.personality-assessment-sheet\{[^}]*max-height:calc\(100svh - 28px\)/);
});