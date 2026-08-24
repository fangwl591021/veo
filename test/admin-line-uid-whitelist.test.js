import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");

test("admin access is granted by a verified LINE UID whitelist", () => {
  const repository = source("src/member-repository.js");
  const worker = source("src/index.js");
  const migration = source("migrations/10000_admin_line_uid_whitelist.sql");
  assert.match(repository, /WHERE line_uid = \? LIMIT 1/);
  assert.match(repository, /WHERE platform_user_id = \? AND system_access = 1 LIMIT 1/);
  assert.match(repository, /lineUid \? 'system' : 'legacy_system'/);
  assert.match(repository, /canManagePermissions: systemAccess/);
  assert.match(worker, /INSERT INTO admin_member_permissions[\s\S]*line_uid/);
  assert.match(worker, /會員尚未綁定已驗證的 LINE UID/);
  assert.match(worker, /if \(!member\?\.profileCompletedAt\) return null/);
  assert.match(migration, /CREATE UNIQUE INDEX IF NOT EXISTS idx_admin_member_permissions_line_uid/);
});

test("member CRM exposes Admin and operator UID whitelist controls", () => {
  const admin = source("public/admin.js");
  assert.match(admin, /後台 UID 白名單/);
  assert.match(admin, /LINE UID：/);
  assert.match(admin, /<b>Admin<\/b>/);
  assert.match(admin, /<b>操作人員<\/b>/);
  assert.match(admin, /儲存白名單/);
});
