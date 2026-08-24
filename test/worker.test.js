import assert from "node:assert/strict";
import test from "node:test";

import worker from "../src/index.js";

const env = { LIFF_ID: "2010657278-VqB7uA2y", LIFF_URL: "https://liff.line.me/2010657278-VqB7uA2y" };

test("GET serves the LIFF login application", async () => {
	const response = await worker.fetch(new Request("https://veo.example/"), env);
	const body = await response.text();
	assert.equal(response.status, 200);
	assert.equal(response.headers.get("content-type"), "text/html; charset=UTF-8");
	assert.equal(response.headers.get("cache-control"), "no-store");
	assert.match(body, /<title>veo 登入<\/title>/);
	assert.match(body, /static\.line-scdn\.net\/liff\/edge\/2\/sdk\.js/);
	assert.match(body, /2010657278-VqB7uA2y/);
	assert.match(body, /withLoginOnExternalBrowser:true/);
});

test("HEAD returns headers without a body", async () => {
	const response = await worker.fetch(new Request("https://veo.example/", { method: "HEAD" }), env);
	assert.equal(response.status, 200);
	assert.equal(response.headers.get("content-type"), "text/html; charset=UTF-8");
	assert.equal(await response.text(), "");
});

test("unsupported methods return 405", async () => {
	const response = await worker.fetch(new Request("https://veo.example/", { method: "POST" }), env);
	assert.equal(response.status, 405);
	assert.equal(response.headers.get("allow"), "GET, HEAD");
});
