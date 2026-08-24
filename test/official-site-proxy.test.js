import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");

test("official A’kaffit homepage is streamed through a fixed-origin privacy-filtering proxy", () => {
  const worker = source("src/index.js");
  const config = source("wrangler.jsonc");
  assert.match(worker, /const AKAFFIT_OFFICIAL_URL = "https:\/\/www\.akaffit\.com\/"/);
  assert.match(worker, /new HTMLRewriter\(\)/);
  assert.match(worker, /<base href="\$\{AKAFFIT_OFFICIAL_URL\}"/);
  assert.match(worker, /\.footer_info/);
  assert.match(worker, /\.floating-icon/);
  assert.match(worker, /body>header/);
  assert.match(worker, /\.on\("body > header"/);
  assert.match(worker, /mailto:\|tel:/);
  assert.match(worker, /url\.pathname === "\/akaffit-official"/);
  assert.match(worker, /\/akaffit-official-runtime/);
  assert.match(worker, /\/akaffit-official-slick\.js/);
  assert.match(worker, /\/akaffit-official-slick\.css/);
  assert.match(worker, /\/akaffit-official-slick-theme\.css/);
  assert.match(worker, /\/akaffit-official-font\/slick\.woff/);
  assert.match(worker, /access-control-allow-origin/);
  assert.match(worker, /replaceAll\("\.\/fonts\/slick\.woff"/);
  assert.match(config, /"\/akaffit-official"/);
  assert.match(config, /"\/akaffit-official-slick\.js"/);
  assert.match(config, /"\/akaffit-official-slick\.css"/);
  assert.match(config, /"\/akaffit-official-font\/\*"/);
});
