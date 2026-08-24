import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { getPublicCard } from "../src/cards.js";

const source = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");

test("public personal-card API data resolves its owner to one stable referral token", async () => {
  const row = {
    id:"card_demo", platform_user_id:"user_owner", display_name:"Tony", selected_version:"standard",
    versions_json:"{}", buttons_json:"[]", status:"published",
  };
  const db = {
    prepare(sql) {
      return {
        bind() {
          return {
            first: async () => sql.includes("FROM personal_cards")
              ? row
              : { member_number:"MB-00123567" },
          };
        },
      };
    },
  };
  const card = await getPublicCard(db, "card_demo");
  assert.equal(card.shareInvite, "akm-MB-00123567");
  assert.equal("userId" in card, false);
});
test("personal-card sharing carries the stable owner referral identifier without exposing LINE UID", () => {
  const cards = source("src/cards.js");
  const app = source("public/app.js");
  const worker = source("src/index.js");
  assert.match(cards, /memberReferralToken\(profile\.member_number\)/);
  assert.match(cards, /JOIN platform_users pu ON pu\.id = mp\.platform_user_id AND pu\.status = 'active'/);
  assert.match(app, /function cardPublicUrl\(cardId, card = null\)[\s\S]*searchParams\.set\("invite", card\.shareInvite\)/);
  assert.match(app, /cardSharePickerUrl\(card\.id, card\)/);
  assert.match(app, /cardLineShareUrl\(cardId, card = null\)[\s\S]*cardPublicUrl\(cardId, card\)/);
  assert.match(worker, /publicCardPath[\s\S]*url\.searchParams\.get\("invite"\)[\s\S]*landingUrl\.searchParams\.set\("invite", inviteToken\)/);
  assert.doesNotMatch(app, /lineUserId.*searchParams|searchParams.*lineUserId/);
});

test("collected public cards remain bound to the original card owner UID", () => {
  const collection = source("src/card-collection.js");
  assert.match(collection, /source_personal_card_id,bound_user_id/);
  assert.match(collection, /'public_card',personalCardId,source\.platform_user_id/);
});

test("shared-card invite attribution still uses first-referrer and self-referral safeguards", () => {
  const repository = source("src/member-repository.js");
  assert.match(repository, /identity\.referrer_user_id \? null : await resolveInvite/);
  assert.match(repository, /member\?\.systemReferrer \? null : await resolveInvite/);
  assert.match(repository, /publicReferrer\.inviter_user_id === referredUserId/);
});