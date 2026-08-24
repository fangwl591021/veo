import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const app = readFileSync(new URL("../../veo/public/app.js", import.meta.url), "utf8");
const liveApp = readFileSync(new URL("../../veo/public/app-20260815-132.js", import.meta.url), "utf8");
const worker = readFileSync(new URL("../../veo/src/index.js", import.meta.url), "utf8");
const config = readFileSync(new URL("../../veo/wrangler.jsonc", import.meta.url), "utf8");

test("destination keeps only authorized LIFF applications", () => {
  for (const source of [app, liveApp, worker, config]) {
    assert.doesNotMatch(source, /2007221311-snSAlddv|2007221311-nEOHqNxK/);
  }
  assert.doesNotMatch(app, /AI_WEAR_LIFF_URL|openAiWear/);
  assert.doesNotMatch(liveApp, /AI_WEAR_LIFF_URL|openAiWear/);
  assert.doesNotMatch(worker, /officialTallLiffHtml|url\.pathname === "\/official"/);
  assert.doesNotMatch(config, /MLM_WORKER/);
  assert.match(config, /2010657278-VqB7uA2y/);
  assert.match(config, /2010657278-blC5Mnqg/);
});
