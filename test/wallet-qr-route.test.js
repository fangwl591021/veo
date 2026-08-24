import test from "node:test";
import assert from "node:assert/strict";
import worker from "../src/index.js";

function walletDb({ valid = true } = {}) {
  const calls = [];
  return {
    calls,
    prepare(sql) {
      return {
        bind(...values) {
          calls.push({ sql, values });
          return {
            async first() {
              if (sql.includes("FROM wallet_tokens")) {
                return valid ? {
                  wallet_token_id: "wallet-token-1",
                  platform_user_id: "member-1",
                  purpose: "member_identification",
                  status: "active",
                  display_name: "<Tony>",
                } : null;
              }
              if (sql.includes("FROM point_accounts")) {
                return {
                  id: "point-account-1",
                  balance: 31,
                  program_code: "main",
                  program_name: "有點開心",
                };
              }
              return null;
            },
            async all() {
              return { results: [] };
            },
            async run() {
              return { success: true };
            },
          };
        },
      };
    },
  };
}

test("wallet QR public route renders a completed scan instead of falling through to blank assets", async () => {
  const db = walletDb();
  const token = "a".repeat(48);
  const response = await worker.fetch(
    new Request(`https://example.test/w/${token}`),
    {
      DB: db,
      ASSETS: { fetch() { throw new Error("wallet route must not use asset fallback"); } },
    },
    {},
  );
  const html = await response.text();

  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type"), /text\/html/);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.match(html, /會員錢包已讀取/);
  assert.match(html, /31 點/);
  assert.match(html, /&lt;Tony&gt;/);
  assert.doesNotMatch(html, /<Tony>/);
  assert.ok(db.calls.some(({ values }) => values.includes("wallet_qr_web")));
});

test("expired wallet QR renders an actionable result page", async () => {
  const response = await worker.fetch(
    new Request(`https://example.test/w/${"b".repeat(48)}`),
    {
      DB: walletDb({ valid: false }),
      ASSETS: { fetch() { throw new Error("wallet route must not use asset fallback"); } },
    },
    {},
  );
  const html = await response.text();

  assert.equal(response.status, 410);
  assert.match(html, /QR Code 已失效/);
  assert.match(html, /重新產生 QR Code/);
});
