import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("duplicate member sessions and phone-birthday identities resolve to the canonical account", () => {
  const repository = fs.readFileSync(new URL("../src/member-repository.js", import.meta.url), "utf8");
  const worker = fs.readFileSync(new URL("../src/index.js", import.meta.url), "utf8");
  const migration = fs.readFileSync(new URL("../migrations/0041_member_account_aliases.sql", import.meta.url), "utf8");

  assert.match(repository, /resolveCanonicalMemberId/);
  assert.match(repository, /COALESCE\(maa\.canonical_user_id, ei\.platform_user_id\)/);
  assert.match(repository, /WHERE mp\.phone = \? AND mp\.birthday = \?/);
  assert.match(worker, /resolveCanonicalMemberId\(env\.DB, session\.sub\)/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS member_account_aliases/);
  assert.match(migration, /duplicate phone birthday identity recovery/);
});
