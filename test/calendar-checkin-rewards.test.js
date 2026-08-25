import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

test("calendar label color uses a visual palette instead of asking for HEX", () => {
  for (const app of [read("../public/app.js"), read("../public/app-20260815-132.js")]) {
    assert.match(app, /function pickCalendarLabelColor/);
    assert.match(app, /class=\"calendar-color-palette\"/);
    assert.match(app, /type=\"color\"/);
    assert.doesNotMatch(app, /標籤顏色（HEX 色碼）/);
  }
  const css = read("../public/styles.css");
  assert.match(css, /\.calendar-color-palette/);
  assert.match(css, /\.calendar-native-color/);
});

test("admin calendar exposes per-session check-in points", () => {
  for (const html of [read("../public/admin.html"), read("../public/admin/index.html")]) {
    assert.match(html, /id="calendarCheckinRewardPoints"/);
    assert.match(html, /填 0 代表不贈點/);
  }
  const admin = read("../public/admin.js");
  assert.match(admin, /checkinRewardPoints: Number/);
  assert.match(admin, /簽到贈點/);
});

test("calendar check-in reward is stored locally and idempotent per member and session", () => {
  const migration = read("../migrations/10001_calendar_checkin_rewards.sql");
  const courses = read("../src/courses.js");
  const points = read("../src/points.js");
  assert.match(migration, /ADD COLUMN checkin_reward_points INTEGER NOT NULL DEFAULT 0/);
  assert.match(courses, /awardCalendarCheckinPoints/);
  assert.match(courses, /cs\.checkin_reward_points/);
  assert.match(points, /calendar_checkin_reward:\$\{sessionId\}:\$\{userId\}/);
  assert.match(points, /'calendar_checkin_reward'/);
  assert.doesNotMatch(points, /mlm\.fangwl591021|MLM_WORKER/);
});
