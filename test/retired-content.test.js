import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");

test("smart matching only exposes card and five-tag matching", () => {
  const app = source("public/app.js");
  const matching = source("src/smart-matching.js");
  assert.doesNotMatch(app, /smartProductPanel|startProductAsk|康立商品顧問|已納入数字科学/);
  assert.match(app, /收藏名片的公開資料與五大標籤/);
  assert.doesNotMatch(matching, /numberScienceContext|数字科学背景|命盤|命定相容性/);
  assert.match(matching, /只依候選人的公司、職稱、部門、服務內容與五大標籤判斷/);
});

test("number science UI is removed and retired APIs return 410", () => {
  const app = source("public/app.js");
  const worker = source("src/index.js");
  const admin = source("public/admin.js");
  const migration = source("migrations/0042_remove_number_science_point_rules.sql");
  assert.doesNotMatch(app, /numberScienceProducts|numberSciencePanel|\/v1\/number-science\/reports/);
  assert.match(worker, /url\.pathname === "\/v1\/number-science\/reports"[\s\S]*?數字科學內容已下架" \}, 410/);
  assert.match(worker, /event_type NOT LIKE 'number_science_%'/);
  assert.doesNotMatch(worker, /pointrule_number_science_/);
  assert.doesNotMatch(admin, /number_science_/);
  assert.match(migration, /DELETE FROM point_rules[\s\S]*event_type LIKE 'number_science_%'/);
  assert.match(worker, /url\.pathname === "\/v1\/smart-product\/ask"[\s\S]*?康立商品內容已下架" \}, 410/);
});

test("personal calendar excludes company labels and synchronized company events", () => {
  const calendar = source("src/personal-calendar.js");
  const app = source("public/app.js");
  const worker = source("src/index.js");
  assert.doesNotMatch(calendar, /function companyEvents|events\.push\(\.\.\.await companyEvents/);
  assert.match(calendar, /filter\(\(label\) => label\.sourceType !== "company"\)/);
  assert.doesNotMatch(app, /公司內容同步自 MLM|正在整合公司、個人與生日提醒/);
  const route = worker.slice(worker.indexOf('url.pathname === "/v1/personal-calendar"'), worker.indexOf('url.pathname === "/v1/personal-calendar/voice"'));
  assert.doesNotMatch(route, /syncMlmCourses/);
});
