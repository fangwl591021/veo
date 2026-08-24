import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const app = readFileSync(new URL("../public/app.js", import.meta.url), "utf8");
const worker = readFileSync(new URL("../src/index.js", import.meta.url), "utf8");
const cards = readFileSync(new URL("../src/cards.js", import.meta.url), "utf8");

test("members can create their electronic card from the existing photo OCR flow", () => {
  const emptyStart = app.indexOf('if (!myCard)');
  const emptyEnd = app.indexOf('const view = state.cardView', emptyStart);
  const emptyCard = app.slice(emptyStart, emptyEnd);
  assert.match(emptyCard, /personalCardCamera[\s\S]*personalCardGallery[\s\S]*startPersonalCardOcr/);
  assert.match(emptyCard, /使用 LINE 資料建立名片/);
  assert.match(emptyCard, /不會加入名片收藏，也不會產生收藏贈點/);

  const scanStart = app.indexOf("function bindPersonalCardScanInputs");
  const scanEnd = app.indexOf("let collectionCards", scanStart);
  const scan = app.slice(scanStart, scanEnd);
  assert.match(scan, /prepareBusinessCardImage/);
  assert.match(app, /processingVersion:'vision-localization-v3'/);
  assert.doesNotMatch(app, /processBusinessCardImage\(file\)/);
  assert.match(app, /compressCardImage\(file\)/);
  assert.match(app, /cropByVisionLocalization/);
  assert.match(scan, /\/v1\/cards\/me\/imports[\s\S]*\/recognize/);
  assert.match(scan, /\/v1\/cards\/me\/imports\/\$\{encodeURIComponent\(eventId\)\}\/confirm/);
  assert.doesNotMatch(scan, /\/submit|queueAndFulfillCardCollectionReward/);
});

test("LINE-created cards start with the A-kaffit branded example", () => {
  const cover = readFileSync(new URL("../public/akaffit-line-card-cover.png", import.meta.url));
  assert.equal(cover.readUInt32BE(16), 1000);
  assert.equal(cover.readUInt32BE(20), 665);
  assert.match(app, /function lineGeneratedCardExample\(\)[\s\S]*akaffit-line-card-cover\.png/);
  assert.match(app, /獨家工藝｜十年研發・酒釀循環發酵/);
  assert.match(app, /純淨低敏｜零負擔咖啡・自在安心喝/);
  assert.match(app, /大師把關｜SCA認證精品豆・大濾掛/);
  assert.match(app, /粉絲專頁[\s\S]*facebook\.com\/qr\?id=61565353201161/);
  assert.match(app, /加LINE好友[\s\S]*line\.me\/R\/ti\/p\/@307bxlka/);
  assert.match(app, /官方網站[\s\S]*www\.akaffit\.com\/index/);
  assert.match(app, /body:JSON\.stringify\(lineGeneratedCardExample\(\)\)/);
  assert.match(cards, /buttonDefaultsSeeded\s*\? storedButtons\.slice\(0, 4\)/);
});
test("personal card import stores the scan as a cover without awarding collection points", () => {
  const start = worker.indexOf("const confirmPersonalCardImport");
  const end = worker.indexOf('if (url.pathname === "/v1/tasks"', start);
  const route = worker.slice(start, end);
  assert.match(route, /review_ready/);
  assert.match(route, /INSERT INTO personal_card_media/);
  assert.match(route, /versions\.standard/);
  assert.match(route, /saveMyCard/);
  assert.match(route, /personal_created/);
  assert.doesNotMatch(route, /queueAndFulfillCardCollectionReward|awardPoints|adjustPoints/);
});
test("personal uploads use a separate fingerprint namespace from collection rewards", () => {
  const collection = readFileSync(new URL("../src/card-collection.js", import.meta.url), "utf8");
  assert.match(worker, /createImport[\s\S]{0,240}\{ purpose:"personal" \}/);
  assert.match(collection, /purpose === 'personal'[\s\S]*'personal-card'/);
  assert.match(collection, /personal-card-imports/);
});
