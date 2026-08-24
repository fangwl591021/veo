import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");

test("home embeds the official A’kaffit Instagram profile", () => {
  const app = source("public/app.js");
  const css = source("public/akaffit.css");
  assert.match(app, /data-content-view="instagram"><svg[\s\S]*?<span>Instagram<\/span>/);
  assert.match(app, /data-content-panel="instagram"/);
  assert.match(app, /https:\/\/www\.instagram\.com\/akaffit\/embed\//);
  assert.match(app, /class="ak-instagram-frame"/);
  assert.match(css, /\.ak-instagram-panel\{[^}]*overflow-y:auto;[^}]*-webkit-overflow-scrolling:touch;[^}]*touch-action:pan-y/);
  assert.match(css, /\.ak-instagram-frame\{height:620px;min-height:0/);
  assert.match(app, /class="ak-instagram-more"[\s\S]*查看更多 Instagram 貼文/);
  assert.doesNotMatch(app, /src="https:\/\/www\.instagram\.com\/akaffit\/" loading=/);
});
