import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const app = readFileSync(new URL("../public/app.js", import.meta.url), "utf8");
const worker = readFileSync(new URL("../src/index.js", import.meta.url), "utf8");
const taskEngine = readFileSync(new URL("../src/task-engine.js", import.meta.url), "utf8");
const migration = readFileSync(new URL("../migrations/0042_ai_task_engine.sql", import.meta.url), "utf8");
const telegramMigration = readFileSync(new URL("../migrations/0043_member_task_telegram_token.sql", import.meta.url), "utf8");

test("Task Engine is reachable from home and supports the complete feedback loop", () => {
  assert.match(app, /data-home-action="tasks">\$\{homeToolIcons\.tasks\}<span>AI 任務/);
  assert.match(app, /✓ 已完成/);
  assert.match(app, /⏰ 延期/);
  assert.match(app, /× 取消/);
  assert.match(app, /＋ 新增紀錄/);
  assert.match(app, /提醒 → 執行 → 回報 → 分析 → 下一步/);
});

test("Task Engine exposes authenticated CRUD, feedback, channel and push routes", () => {
  assert.match(worker, /url\.pathname === "\/v1\/tasks" && request\.method === "GET"/);
  assert.match(worker, /url\.pathname === "\/v1\/tasks" && request\.method === "POST"/);
  assert.match(worker, /url\.pathname === "\/v1\/tasks\/channels"/);
  assert.match(worker, /taskActionMatch/);
  assert.match(worker, /taskPushMatch/);
  assert.match(worker, /runDueTaskPushes/);
});

test("Task Engine migration preserves history and backfills existing card CRM tasks", () => {
  assert.match(migration, /CREATE TABLE IF NOT EXISTS ai_tasks/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS ai_task_events/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS ai_task_deliveries/);
  assert.match(migration, /task_backfill_/);
  assert.match(migration, /FROM personal_calendar_events/);
});
test("LINE OA remains available in the backend but is dormant and hidden", () => {
  assert.doesNotMatch(app, /taskLineEnabled|使用 LINE Push|LINE Push 可用/);
  assert.match(app, /lineEnabled:channel\.lineEnabled===true/);
  assert.match(taskEngine, /async function pushLine/);
  assert.match(taskEngine, /lineEnabled:false/);
  assert.match(taskEngine, /body\.lineEnabled === true/);
});
test("Task center includes the complete aiweb-style overview and Telegram guidance", () => {
  assert.match(app, /taskOverviewMarkup/);
  assert.match(app, /今日到期/);
  assert.match(app, /task-loop/);
  assert.match(app, /Telegram 個人推播設定/);
  assert.match(app, /taskTelegramHelpDialog/);
  assert.match(app, /aria-expanded/);
});
test("members can securely configure their own Telegram Bot Token", () => {
  assert.match(app, /id="taskTelegramBotToken"/);
  assert.match(app, /id="taskTelegramDetect"/);
  assert.match(app, /id="taskTelegramTest"/);
  assert.match(app, /每位會員使用自己的 Telegram Bot/);
  assert.match(worker, /\/v1\/tasks\/channels\/discover/);
  assert.match(worker, /\/v1\/tasks\/channels\/test/);
  assert.match(taskEngine, /telegram_bot_token_encrypted/);
  assert.match(taskEngine, /encryptTelegramBotToken/);
  assert.match(telegramMigration, /telegram_bot_token_encrypted/);
  assert.match(telegramMigration, /telegram_bot_token_last4/);
  assert.doesNotMatch(app, /telegram_bot_token_encrypted/);
});
