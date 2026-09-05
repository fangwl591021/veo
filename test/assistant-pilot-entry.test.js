import test from "node:test";
import assert from "node:assert/strict";
import { readAssistantPilotEntry as entry, preserveAssistantPilotEntry as preserve } from "../public/assistant-pilot-entry.js";
import { createAssistantPilotBridge } from "../public/assistant-pilot-bridge.js";

const origin = "https://veo.example";
test("pilot entry survives the invite redirect, LIFF callback and private-entry return", () => {
  assert.equal(entry(`${origin}/i/abc123`), "abc123");
  assert.equal(entry(`${origin}/?invite=abc123`), "abc123");
  assert.equal(entry(`${origin}/?liff.state=${encodeURIComponent('/?invite=abc123')}`), "abc123");
  assert.equal(entry(`${origin}/v1/home-preview?view=entry&previewInvite=abc123`), "abc123");
  assert.equal(entry(origin + preserve("/?tab=daily", "abc123", origin)), "abc123");
  assert.equal(preserve("/?tab=daily", "abc123", origin), "/?tab=daily&previewInvite=abc123");
});
test("normal visits and public sharing never inherit a stored pilot entry", () => {
  for (const path of ["/", "/?tab=tasks", "/?publicCard=card&invite=abc123", "/?sharedContact=card&previewInvite=abc123", "/?courseSession=class&invite=abc123"]) {
    assert.equal(entry(origin + path), "", path);
  }
});
test("ambiguous, blank, duplicated and foreign nested entry parameters fail closed", () => {
  for (const path of [
    "/?invite=a&invite=a", "/?previewInvite=a&previewInvite=b", "/?invite=&previewInvite=a",
    "/?invite=a&previewInvite=b", "/i/a?invite=b", "/?invite=%20a", "/i/%2Fbad",
    "/?liff.state=%2F%3Finvite%3Da&liff.state=%2F%3Finvite%3Da",
    "/?invite=a&liff.state=" + encodeURIComponent("/?invite=b"),
    "/?liff.state=" + encodeURIComponent("https://other.example/?invite=a"),
    "/?liff.state=" + encodeURIComponent("/?liff.state=%2F%3Finvite%3Da"),
  ]) assert.equal(entry(origin + path), "", path);
  assert.throws(() => preserve("https://other.example", "a", origin));
});

function harness(t, href, api) {
  const previous = { location:globalThis.location, document:globalThis.document, history:globalThis.history };
  globalThis.location = new URL(href);
  globalThis.document = { body:{classList:{remove() {}}} };
  globalThis.history = {replaceState() {}};
  t.after(() => { for (const [key,value] of Object.entries(previous)) { if (value === undefined) delete globalThis[key]; else globalThis[key] = value; } });
  return createAssistantPilotBridge({root:{}, api, onNavigate() {}, onOverview() {}});
}
test("bridge uses only the server-verified matching member, without client allow flags", async t => {
  const requests = [];
  let response = {allowed:true,memberId:"someone-else"};
  const pilot = harness(t, origin + "/?invite=abc123", async (...args) => { requests.push(args); return response; });
  assert.equal(await pilot.authorize({userId:"owner"}), false);
  response = {allowed:true,memberId:"owner"};
  assert.equal(await pilot.authorize({userId:"owner"}), true);
  assert.equal(requests[0][1].headers["x-veo-pilot-entry"], "abc123");
  assert.equal(requests[0][1].body, "{}");
});
test("normal visit makes no pilot request; access rejection leaves original flow available", async t => {
  let calls = 0;
  const pilot = harness(t, origin, async () => { calls += 1; });
  assert.equal(await pilot.mount({userId:"owner"}), false);
  assert.equal(calls, 0);
});
test("an access response arriving after logout cannot reopen the pilot", async t => {
  let finish;
  const pilot = harness(t, origin + "/?invite=abc123", () => new Promise(resolve => {finish = resolve;}));
  const pending = pilot.authorize({userId:"owner"});
  pilot.forget();
  finish({allowed:true, memberId:"owner"});
  assert.equal(await pending, false);
  assert.equal(pilot.hasEntry, false);
});
test("revoked and unauthenticated pilot access both fail closed", async t => {
  for (const status of [401,403]) {
    const pilot = harness(t, origin + "/?invite=abc123", async () => { throw Object.assign(new Error("denied"), {status}); });
    assert.equal(await pilot.mount({userId:"owner"}), false);
  }
});
