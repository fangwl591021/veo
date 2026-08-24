import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  PERSONALITY_ASSESSMENTS,
  publicPersonalityAssessments,
  scorePersonalityAssessment,
} from "../src/personality-assessments.js";

const answersFor = (type, value = 3) => Object.fromEntries(
  PERSONALITY_ASSESSMENTS[type].questions.map((question) => [question.id, value]),
);

test("publishes four complete personality questionnaires without scoring dimensions", () => {
  const definitions = publicPersonalityAssessments();
  assert.deepEqual(Object.keys(definitions), ["mbti", "disc", "enneagram", "big_five"]);
  assert.deepEqual(Object.values(definitions).map((item) => item.questions.length), [16, 12, 18, 15]);
  assert.equal("dimension" in definitions.mbti.questions[0], false);
});

test("all four assessments are scored on the server", () => {
  const mbti = answersFor("mbti", 1);
  for (const question of PERSONALITY_ASSESSMENTS.mbti.questions) {
    if (["E", "S", "T", "J"].includes(question.dimension)) mbti[question.id] = 5;
  }
  assert.equal(scorePersonalityAssessment("mbti", mbti).resultCode, "ESTJ");
  const disc = answersFor("disc", 1);
  for (const question of PERSONALITY_ASSESSMENTS.disc.questions) if (question.dimension === "D") disc[question.id] = 5;
  assert.match(scorePersonalityAssessment("disc", disc).headline, /D 主導型/);
  const enneagram = answersFor("enneagram", 1);
  for (const question of PERSONALITY_ASSESSMENTS.enneagram.questions) if (question.dimension === "5") enneagram[question.id] = 5;
  assert.equal(scorePersonalityAssessment("enneagram", enneagram).resultCode, "5");
  assert.deepEqual(Object.keys(scorePersonalityAssessment("big_five", answersFor("big_five", 4)).scores), ["O", "C", "E", "A", "N"]);
});

test("incomplete and manipulated answers are rejected", () => {
  assert.throws(() => scorePersonalityAssessment("mbti", {}), /請完成全部 16 題/);
  const answers = answersFor("disc", 3);
  answers.d1 = 9;
  assert.throws(() => scorePersonalityAssessment("disc", answers), /請完成全部 12 題/);
  assert.throws(() => scorePersonalityAssessment("unknown", {}), /不支援/);
});

test("migration, authenticated routes and AI refresh integration are present", () => {
  const worker = readFileSync(new URL("../src/index.js", import.meta.url), "utf8");
  const migration = readFileSync(new URL("../migrations/0044_member_personality_assessments.sql", import.meta.url), "utf8");
  const insights = readFileSync(new URL("../src/member-crm-insights.js", import.meta.url), "utf8");
  assert.match(worker, /GET" && url\.pathname === "\/v1\/personality-assessments"/);
  assert.match(worker, /POST" && url\.pathname === "\/v1\/personality-assessments"/);
  assert.match(worker, /savePersonalityAssessment\(env\.DB, member\.userId/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS member_personality_assessments/);
  assert.match(insights, /line-fate-v2-personality/);
  assert.match(insights, /personality_assessments/);
});
