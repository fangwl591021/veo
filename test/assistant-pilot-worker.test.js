import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import worker from "../src/index.js";

test("real Worker routes deny every private pilot API without a session", async () => {
  const DB = { prepare() { throw new Error("Unauthenticated request must not read member data"); } };
  for (const [method, route] of [["POST","access"],["GET","context"],["POST","reply"],["POST","confirm"]]) {
    const request = new Request(`https://veo.example/v1/assistant-pilot/${route}`, {method,
      headers:{"content-type":"application/json","x-veo-pilot-entry":"fake-entry"},
      ...(method === "POST" ? {body:"{}"} : {}),
    });
    const response = await worker.fetch(request,{DB},{});
    assert.equal(response.status,401,route);
    assert.equal((await response.json()).code,"unauthorized");
    assert.equal(response.headers.get("cache-control"),"no-store");
  }
});

test("both served indexes select the same build, with pilot integration in both app variants", () => {
  const indexes = ["index.html", "index-20260815-133.txt"].map(file => readFileSync(new URL(`../public/${file}`, import.meta.url),"utf8"));
  const build = indexes.map(html => html.match(/src="(\/app-20260815-132\.js\?v=[^"]+)"/)[1]);
  assert.equal(build[0],build[1]);
  assert.match(build[0],/20260905-pilot-1/);
  for (const file of ["app.js","app-20260815-132.js"]) {
    const source = readFileSync(new URL(`../public/${file}`,import.meta.url),"utf8");
    assert.match(source,/await assistantPilot\.mount\(state\.member\)/);
    assert.match(source,/if \(await resumeAssistantPilotOwner\(\)\) return/);
    assert.match(source,/assistantPilot\.forget\(\)/);
  }
});
