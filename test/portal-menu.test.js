import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const app = readFileSync(new URL("../public/app.js", import.meta.url), "utf8");
const menuCss = readFileSync(new URL("../public/task-engine-20260813-4.css", import.meta.url), "utf8");
const productionIndex = readFileSync(new URL("../public/index-20260815-128.txt", import.meta.url), "utf8");

test("內頁功能列移除星座、AI 任務與返回首頁，返回首頁固定在 Banner", () => {
  const start = app.indexOf("const portalMenu");
  const end = app.indexOf("function openAiWear", start);
  const menu = app.slice(start, end);
  const actions = [...menu.matchAll(/data-home-action="([^"]+)"/g)].map((match) => match[1]);

  assert.deepEqual(actions, [
    "cardCollection",
    "card",
    "daily",
    "smartMatch",
    "calendar",
  ]);
  assert.ok(menu.includes('data-home-action="cardCollection"><span>名片收藏</span></button><button data-home-action="card"><span>電子名片</span>'));
  assert.ok(menu.includes('data-home-action="calendar"><span>個人行程</span></button></section>'));
  assert.ok(!menu.includes('data-home-action="home"'));
  assert.ok(!menu.includes('data-home-action="zodiac"'));
  assert.ok(!menu.includes('data-home-action="tasks"'));

  const layoutStart = app.indexOf("function layout");
  const layoutEnd = app.indexOf("async function login", layoutStart);
  const layout = app.slice(layoutStart, layoutEnd);
  assert.ok(layout.includes('class="feature-header-actions"'));
  assert.ok(layout.includes('class="feature-header-action feature-home-action" data-home-action="home"'));
  assert.ok(layout.includes('const headerActions = `<div class="feature-header-actions">${homeAction}</div>`'));
  assert.ok(!layout.includes('cardCollectionAction'));
  assert.ok(!layout.includes('data-home-action="cardCollection"'));
  assert.ok(layout.includes('aria-label="返回首頁"'));
  assert.equal((app.match(/data-home-action="home"/g) || []).length, 1);
  assert.ok(!app.includes('class="back-card" data-home-action="home"'));
});
test("內頁五項功能列平均填滿寬度，不產生橫向留白", () => {
  assert.match(menuCss, /\.portal-menu-text\{overflow-x:hidden;grid-template-columns:repeat\(5,minmax\(0,1fr\)\)!important\}/);
  assert.doesNotMatch(menuCss, /repeat\(7,minmax\(96px,1fr\)\)/);
  assert.match(productionIndex, /task-engine-20260813-4\.css/);
});
