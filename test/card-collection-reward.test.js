import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { cardCollectionPointKeys } from "../src/card-collection-reward.js";

const source = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");

test("card scan reward and deletion reversal use stable idempotency keys", () => {
  const first = cardCollectionPointKeys("member-1", "card-1");
  assert.deepEqual(first, cardCollectionPointKeys("member-1", "card-1"));
  assert.notEqual(first.award, first.reversal);
  assert.notEqual(first.award, cardCollectionPointKeys("member-1", "card-2").award);
});

test("card rewards post locally and deletion reverses the same award once", () => {
  const reward = source("src/card-collection-reward.js");
  const worker = source("src/index.js");
  assert.match(reward, /awardPoints\(env\.DB/);
  assert.match(reward, /card_collection_reward_reversal/);
  assert.match(reward, /status='reversed'/);
  assert.match(reward, /balance<points/);
  assert.doesNotMatch(reward, /mlm\.internal\/api\/internal\/klink\/card-collection-reward/);
  assert.match(worker, /deleteContactAndReverseReward/);
  assert.match(source("public/app.js"), /已刪除，已扣回/);
});
