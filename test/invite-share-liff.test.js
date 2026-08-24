import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { inviteShareLiffHtml } from "../src/invite-share-liff.js";

const app = readFileSync(new URL("../public/app.js", import.meta.url), "utf8");
const worker = readFileSync(new URL("../src/index.js", import.meta.url), "utf8");

test("mobile invite sharing uses the dedicated share LIFF", async () => {
  assert.match(app, /https:\/\/liff\.line\.me\/\$\{encodeURIComponent\(liffId\)\}\/r\/invite-share/);
  assert.match(app, /isLineEnvironment && dedicatedPickerUrl[\s\S]*location\.assign\(dedicatedPickerUrl\)/);
  assert.match(worker, /url\.pathname === "\/r\/invite-share"[\s\S]*inviteShareLiffHtml/);
  assert.match(worker, /stateUrl\.pathname === "\/r\/invite-share"[\s\S]*inviteToken/);

  const response = inviteShareLiffHtml({
    liffId: "2010657278-blC5Mnqg",
    origin: "https://akaffit-team.example",
    inviteToken: "60d44b9563b4dc49f2cab2925e3c69b01bb57d9e1ca2e2d6",
  });
  const html = await response.text();
  assert.equal(response.status, 200);
  assert.match(html, /liff\.init\(\{liffId:LIFF_ID\}\)/);
  assert.match(html, /liff\.isApiAvailable\("shareTargetPicker"\)/);
  assert.match(html, /liff\.shareTargetPicker\(\[\{type:"text"/);
  assert.match(html, /A’kaffit 專屬分享/);
  assert.match(html, /https:\/\/akaffit-team\.example\/i\/60d44b/);
  assert.doesNotMatch(html, /line\.me\/R\/share/);
  const inlineScript = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].at(-1)?.[1] || "";
  assert.doesNotThrow(() => new Function(inlineScript));
});
