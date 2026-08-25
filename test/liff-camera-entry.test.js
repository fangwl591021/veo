import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import worker from "../src/index.js";

const app = readFileSync(new URL("../public/app.js", import.meta.url), "utf8");
const index = readFileSync(new URL("../public/index.html", import.meta.url), "utf8");
const workerSource = readFileSync(new URL("../src/index.js", import.meta.url), "utf8");
const taskSource = readFileSync(new URL("../src/task-engine.js", import.meta.url), "utf8");
const wrangler = readFileSync(new URL("../wrangler.jsonc", import.meta.url), "utf8");

test("camera and gallery inputs keep their native Android contracts", () => {
  for (const id of ["personalCardCamera", "personalCardBack", "cardCamera", "cardBack"]) {
    assert.match(app, new RegExp(`id="${id}"[^>]*accept="image/\\*"[^>]*capture="environment"`));
  }
  for (const id of ["personalCardGallery", "cardGallery"]) {
    const input = app.match(new RegExp(`<input id="${id}"[^>]*>`))?.[0] || "";
    assert.match(input, /accept="image\/\*"/);
    assert.doesNotMatch(input, /capture=/);
  }
  assert.doesNotMatch(app, /document\.getElementById\(["'](?:personalCardCamera|cardCamera)["']\)\?*\.click\(\)/);
  const businessCardFlow = app.slice(app.indexOf("async function card()"), app.indexOf("function showCollectionReview"));
  assert.doesNotMatch(businessCardFlow, /navigator\.mediaDevices\.getUserMedia/);
});

test("camera inputs are rebuilt after each card page renders and before handlers bind", () => {
  assert.match(app, /function refreshNativeBusinessCardCameraInput\(inputId\)/);
  assert.match(app, /const fresh = current\.cloneNode\(true\)/);
  assert.match(app, /fresh\.setAttribute\("accept", "image\/\*"\)/);
  assert.match(app, /fresh\.setAttribute\("capture", "environment"\)/);
  assert.match(app, /current\.replaceWith\(fresh\)/);
  assert.match(app, /refreshBusinessCardCameraInputs\("mycard"\);\s*bindPersonalCardScanInputs\(\)/);
  assert.match(app, /refreshBusinessCardCameraInputs\("collected"\);\s*bindScanInputs\(\)/);
  assert.doesNotMatch(app, /refreshNativeBusinessCardCameraInput\("(?:personalCardGallery|cardGallery)"\)/);
  assert.match(app, /prepareBusinessCardImage\(selected\[index\], index \? "背面" : "正面", "personal"\)/);
  assert.match(app, /\$\("#personalCardCamera"\)\.onchange/);
  assert.match(app, /\$\("#cardCamera"\)\.onchange/);
});

test("scan surfaces diagnose the real LIFF client and offer the project LIFF URL", () => {
  assert.match(app, /function cameraEntryNotice\(\)/);
  assert.match(app, /window\.liff\?\.isInClient\?\.\(\)/);
  assert.match(app, /https:\/\/liff\.line\.me\/\$\{encodeURIComponent\(liffId\)\}/);
  assert.match(app, /camera_probe:"android"/);
  assert.match(app, /Android 拍照請從 LIFF 開啟/);
});

test("member entry URLs prefer this project's LIFF and preserve legacy invite paths", async () => {
  assert.match(wrangler, /"LIFF_ID": "2010657278-VqB7uA2y"/);
  assert.match(workerSource, /const shareUrl = env\.LIFF_ID[\s\S]*https:\/\/liff\.line\.me\/[\s\S]*\?invite=/);
  assert.match(taskSource, /const liffId = text\(env\.LIFF_ID, 200\)[\s\S]*https:\/\/liff\.line\.me/);

  const response = await worker.fetch(
    new Request("https://akaffit.example/i/permanent-token-123"),
    {},
    {},
  );
  assert.equal(response.status, 302);
  assert.equal(response.headers.get("location"), "https://akaffit.example/?invite=permanent-token-123");
});

test("production index loads the cache-busted LIFF camera build", () => {
  assert.match(index, /app-20260815-132\.js\?v=20260825-4/);
  assert.match(index, /styles\.css\?v=20260825-73/);
  const workerIndex = readFileSync(new URL("../public/index-20260815-133.txt", import.meta.url), "utf8");
  assert.match(workerIndex, /styles\.css\?v=20260825-73/);
});
