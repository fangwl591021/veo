import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolvePhoneBirthdayMember } from "../src/member-repository.js";

class ExistingPhoneDb {
  prepare(sql) {
    return {
      bind: () => ({
        first: async () => {
          if (sql.includes("FROM external_identities ei")) return null;
          if (sql.includes("WHERE mp.phone = ? AND mp.birthday = ?")) return null;
          if (sql.includes("WHERE mp.phone = ?")) {
            return { platform_user_id:"usr_existing", birthday:"1960-10-21" };
          }
          throw new Error(`Unexpected query: ${sql}`);
        },
        run: async () => {
          throw new Error(`Unexpected mutation: ${sql}`);
        },
      }),
    };
  }
}

test("same phone with a mismatched birthday cannot create another member", async () => {
  await assert.rejects(
    resolvePhoneBirthdayMember(new ExistingPhoneDb(), "0927-136-844", "390305", ""),
    /此手機已建立會員，但生日驗證不符/,
  );
});

test("exact phone and birthday recovery binds a stable login identity", () => {
  const repository = readFileSync(new URL("../src/member-repository.js", import.meta.url), "utf8");
  assert.match(repository, /ON CONFLICT\(provider, provider_subject\) DO UPDATE SET/);
  assert.match(repository, /platform_user_id = excluded\.platform_user_id/);
});

test("CRM supports protected soft deletion and hides deleted members", () => {
  const worker = readFileSync(new URL("../src/index.js", import.meta.url), "utf8");
  const admin = readFileSync(new URL("../public/admin.js", import.meta.url), "utf8");
  assert.match(worker, /request\.method === "DELETE" && memberDetailMatch/);
  assert.match(worker, /if \(member\?\.status === "active"\) return member/);
  assert.match(worker, /不可刪除目前登入的管理員帳號/);
  assert.match(worker, /不可刪除最高管理者帳號/);
  assert.match(worker, /NOT EXISTS \([\s\S]*member_account_aliases maa/);
  assert.match(worker, /此帳號已合併至主會員，不可刪除登入識別/);
  assert.match(worker, /請先重新指定推薦人/);
  assert.match(worker, /UPDATE platform_users SET status='deleted'/);
  assert.match(worker, /DELETE FROM external_identities/);
  assert.match(worker, /WHERE pu\.status != 'deleted'/);
  assert.match(worker, /admin\.member\.deleted/);
  assert.match(admin, /id="deleteMemberAccount">刪除會員/);
  assert.match(admin, /data\.access\?\.systemAccess/);
  assert.match(admin, /#closeMemberDetail[\s\S]*beforebegin/);
  assert.match(admin, /此操作會停用帳號並移除登入識別，但會保留點數與稽核歷史/);
  assert.match(admin, /undefined, "DELETE"/);
});
