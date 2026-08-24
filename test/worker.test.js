import assert from "node:assert/strict";
import test from "node:test";

import worker from "../src/index.js";

const env = {
  LIFF_ID: "2010657278-VqB7uA2y",
  LIFF_URL: "https://liff.line.me/2010657278-VqB7uA2y"
};

test("renders the configured LIFF page", async () => {
  const request = new Request("https://veo.example/");
  const response = await worker.fetch(request, env, {});
  const html = await response.text();

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "text/html; charset=UTF-8");
  assert.match(html, /liff\.init\(\{ liffId: config\.liffId \}\)/);
  assert.match(html, /2010657278-VqB7uA2y/);
  assert.match(html, /https:\/\/liff\.line\.me\/2010657278-VqB7uA2y/);
});

test("fails closed when LIFF configuration is missing", async () => {
  const request = new Request("https://veo.example/");
  const response = await worker.fetch(request, {}, {});

  assert.equal(response.status, 500);
  assert.equal(await response.text(), "Service unavailable");
});
