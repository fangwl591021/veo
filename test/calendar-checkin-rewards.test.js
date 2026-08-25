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
    assert.match(html, /class="nav-item" data-page="calendar"/);
    assert.match(html, /行事曆簽到贈點/);
    assert.match(html, /data-go="calendar"/);
    assert.match(html, /id="calendarCheckinRewardPoints"/);
    assert.match(html, /id="calendarNew"[^>]*>＋ 新增活動／設定贈點/);
    assert.match(html, /id="calendarRewardStart"[^>]*>立即設定/);
    assert.match(html, /class="calendar-reward-field"/);
    assert.match(html, /0 代表不贈點/);
  }
  const admin = read("../public/admin.js");
  assert.match(admin, /checkinRewardPoints: Number/);
  assert.match(admin, /calendar-reward-badge/);
  assert.match(admin, /編輯活動／贈點/);
  assert.match(admin, /calendarRewardStart/);
  assert.match(admin, /switchPage\(location\.hash\.slice\(1\) \|\| "dashboard"\)/);
  assert.match(admin, /calendarNew"\)\?\.addEventListener\('click', \(\) => fillCalendarEditor\(\)/);
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
