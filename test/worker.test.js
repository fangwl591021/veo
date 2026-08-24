import assert from "node:assert/strict";
import test from "node:test";

import worker from "../src/index.js";

for (const method of ["GET", "POST"]) {
  test(`${method} requests preserve the source response`, async () => {
    const request = new Request("https://veo.example/test-path", { method });
    const response = await worker.fetch(request, {}, {});

    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-type"), "text/plain;charset=UTF-8");
    assert.equal(await response.text(), "Hello World!");
  });
}
