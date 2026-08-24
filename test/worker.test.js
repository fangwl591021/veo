import assert from "node:assert/strict";
import test from "node:test";

import worker from "../src/index.js";

const env = {
  LIFF_ID: "2010657278-VqB7uA2y",
  LIFF_URL: "https://liff.line.me/2010657278-VqB7uA2y",
};

for (const method of ["GET", "POST"]) {
  test(`${method} requests preserve the source response`, async () => {
    const request = new Request("https://veo.example/test-path", { method });
    const response = await worker.fetch(request, env, {});

    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-type"), "text/plain;charset=UTF-8");
    assert.equal(await response.text(), "Hello World!");
  });
}
