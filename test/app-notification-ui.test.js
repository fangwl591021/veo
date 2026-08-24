import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const notify = readFileSync(new URL('../public/app-notify.js', import.meta.url), 'utf8');
const index = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
const workerIndex = readFileSync(new URL('../public/index-20260815-133.txt', import.meta.url), 'utf8');
const worker = readFileSync(new URL('../src/index.js', import.meta.url), 'utf8');
const app = readFileSync(new URL('../public/app-20260815-132.js', import.meta.url), 'utf8');

function assertNotifyBeforeApp(html) {
  const notifyIndex = html.indexOf('/app-notify.js');
  const appIndex = html.indexOf('/app-20260815-132.js');
  assert.ok(notifyIndex >= 0);
  assert.ok(appIndex > notifyIndex);
}

test('notification layer loads before the main app bundle in static and real worker homepages', () => {
  assertNotifyBeforeApp(index);
  assertNotifyBeforeApp(workerIndex);
  assert.match(worker, /index-20260815-133\.txt/);
});

test('legacy alert calls are globally routed to in-app notice UI', () => {
  assert.match(notify, /window\.appNotice/);
  assert.match(notify, /window\.alert\s*=\s*\(message\)/);
  assert.match(notify, /ak-notify-card/);
  assert.match(notify, /ak-notify-success/);
  assert.match(notify, /操作完成/);
});

test('confirm and prompt use reusable in-app dialogs without browser chrome', () => {
  assert.match(notify, /window\.appConfirm/);
  assert.match(notify, /window\.appPrompt/);
  assert.match(notify, /ak-notify-input/);
  assert.doesNotMatch(notify, /location\.hostname|document\.domain/);
  assert.doesNotMatch(app, /\bconfirm\s*\(/);
  assert.doesNotMatch(app, /\bprompt\s*\(/);
  assert.match(app, /await appConfirm\(/);
  assert.match(app, /await appPrompt\(/);
});
