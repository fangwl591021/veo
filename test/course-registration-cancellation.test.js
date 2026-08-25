import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { cancelCourseRegistration } from "../src/courses.js";

const source = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");

class CancellationDb {
  constructor(row) {
    this.row = row;
    this.updateCount = 0;
  }
  prepare(sql) {
    const db = this;
    return {
      bind() {
        return {
          async first() { return db.row; },
          async run() { db.updateCount += 1; return { meta: { changes: 1 } }; },
        };
      },
    };
  }
}

test("verified attendance cannot be cancelled from member or admin registration flows", async () => {
  const db = new CancellationDb({ id:"registration_1", status:"registered", attendance_status:"verified" });
  assert.deepEqual(await cancelCourseRegistration(db, { registrationId:"registration_1" }), { ok:false, reason:"attendance_completed" });
  assert.equal(db.updateCount, 0);
});

test("an active registration is retained as a cancelled audit record", async () => {
  const db = new CancellationDb({ id:"registration_1", status:"registered", attendance_status:"" });
  assert.deepEqual(await cancelCourseRegistration(db, { userId:"member_1", sessionId:"session_1" }), { ok:true, duplicate:false, registrationId:"registration_1" });
  assert.equal(db.updateCount, 1);
  const courses = source("src/courses.js");
  assert.match(courses, /SET status = 'cancelled', cancelled_at = CURRENT_TIMESTAMP/);
  assert.match(courses, /SET status = 'registered', registered_at = CURRENT_TIMESTAMP, cancelled_at = NULL/);
});

test("member and admin interfaces both expose cancellation controls", () => {
  for (const app of [source("public/app.js"), source("public/app-20260815-132.js")]) {
    assert.match(app, /data-cancel-registration="\$\{esc\(s\.sessionId\)\}">取消報名/);
    assert.match(app, /\/cancel-registration/);
    assert.match(app, /s\.attendanceStatus !== "verified"/);
  }
  const worker = source("src/index.js");
  const admin = source("public/admin.js");
  const adminCss = source("public/admin.css");
  assert.match(worker, /calendarRegistrationsMatch = url\.pathname\.match/);
  assert.match(worker, /listSessionRegistrations/);
  assert.match(worker, /adminRegistrationCancelMatch/);
  assert.match(admin, /data-calendar-registrations=.*報名名單/);
  assert.match(admin, /data-admin-cancel-registration=.*取消報名/);
  assert.match(adminCss, /\.calendar-registration-modal/);
});
