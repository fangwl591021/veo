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

test("admin calendar exposes signed per-session check-in points", () => {
  for (const html of [read("../public/admin.html"), read("../public/admin/index.html")]) {
    assert.match(html, /class="nav-item" data-page="calendar"/);
    assert.match(html, /行事曆簽到點數/);
    assert.match(html, /data-go="calendar"/);
    assert.match(html, /id="calendarCheckinRewardPoints"/);
    assert.match(html, /id="calendarNew"[^>]*>＋ 新增活動／設定點數/);
    assert.match(html, /id="calendarRewardStart"[^>]*>立即設定/);
    assert.match(html, /class="calendar-reward-field"/);
    assert.match(html, /min="-1000000"/);
    assert.match(html, /正數贈點／負數扣點/);
    assert.match(html, /0 代表不異動/);
  }
  const admin = read("../public/admin.js");
  assert.match(admin, /checkinPointsDelta: Number/);
  assert.match(admin, /calendar-reward-badge/);
  assert.match(admin, /編輯活動／點數/);
  assert.match(admin, /delta<0\?`簽到 \$\{delta\} 點`/);
  assert.match(admin, /calendarRewardStart/);
  assert.match(admin, /switchPage\(location\.hash\.slice\(1\) \|\| "dashboard"\)/);
  assert.match(admin, /calendarNew"\)\?\.addEventListener\('click', \(\) => fillCalendarEditor\(\)/);
});

test("calendar check-in points add or deduct locally and reject an insufficient balance", () => {
  const migration = read("../migrations/10002_calendar_checkin_points_delta.sql");
  const courses = read("../src/courses.js");
  const points = read("../src/points.js");
  assert.match(migration, /ADD COLUMN checkin_points_delta INTEGER NOT NULL DEFAULT 0/);
  assert.match(migration, /checkin_points_delta >= -1000000/);
  assert.match(courses, /applyCalendarCheckinPoints/);
  assert.match(courses, /cs\.checkin_points_delta/);
  assert.match(courses, /pointResult\.reason === 'insufficient_points'/);
  assert.ok(courses.indexOf("pointResult.reason === 'insufficient_points'") < courses.indexOf('INSERT INTO attendance_records'));
  assert.match(points, /amount < 0/);
  assert.match(points, /balanceAfter < 0/);
  assert.match(points, /reason: 'insufficient_points'/);
  assert.match(points, /calendar_checkin_reward:\$\{sessionId\}:\$\{userId\}/);
  assert.match(points, /'calendar_checkin_reward'/);
  assert.doesNotMatch(points, /mlm\.fangwl591021|MLM_WORKER/);
});

test("current member and admin surfaces call K points simply points", () => {
  for (const app of [read("../public/app.js"), read("../public/app-20260815-132.js"), read("../public/admin.js")]) {
    assert.doesNotMatch(app, /K點|K 點/);
  }
});

test("members can reach registration before scanning the fixed check-in QR", () => {
  for (const app of [read("../public/app.js"), read("../public/app-20260815-132.js")]) {
    assert.match(app, /class="ak-course-registration-entry" aria-label="活動報名入口"/);
    assert.match(app, /data-home-action="courses">\$\{portalIcon\("courses"\)\}/);
    assert.match(app, /先完成報名，活動時間內再掃描固定 QR 簽到/);
    assert.match(app, /id="openCourseRegistration">前往活動報名/);
    assert.match(app, /error\.message === "registration_required"/);
    assert.match(app, /<h2>活動報名<\/h2>/);
    assert.match(app, />\$\{registered\.has\(s\.sessionId\) \? "已報名" : "立即報名"\}<\/button>/);
    assert.match(app, /state\.courseView = "records";\s+await courses\(\)/);
  }
  const css = read("../public/akaffit-20260801-41.css");
  assert.match(css, /\.ak-course-registration-entry/);
  assert.match(css, /\.smart-checkin-actions/);
});
