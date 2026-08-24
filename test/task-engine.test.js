import assert from "node:assert/strict";
import test from "node:test";
import { saveTaskChannels, validateTaskInput } from "../src/task-engine.js";
import { decryptTelegramBotToken } from "../src/telegram-token-crypto.js";

test("Task Engine validates and normalizes a new task", () => {
  const task = validateTaskInput({
    title:"  回訪王小姐  ",
    description:"確認合作需求",
    dueAt:"2026-07-30T02:00:00.000Z",
    priority:"high",
    contactCardId:"card_1",
  });
  assert.equal(task.title, "回訪王小姐");
  assert.equal(task.priority, "high");
  assert.equal(task.dueAt, "2026-07-30T02:00:00.000Z");
  assert.equal(task.contactCardId, "card_1");
});

test("Task Engine rejects an empty title and invalid due date", () => {
  assert.throws(() => validateTaskInput({ title:"", dueAt:"2026-07-30" }), /任務名稱/);
  assert.throws(() => validateTaskInput({ title:"任務", dueAt:"not-a-date" }), /任務時間/);
});

test("Task Engine falls back to normal priority", () => {
  const task = validateTaskInput({ title:"任務", dueAt:"2026-07-30T02:00:00.000Z", priority:"urgent" });
  assert.equal(task.priority, "normal");
});
test("personal Telegram token is encrypted and blank updates preserve it", async () => {
  const secret="test-session-signing-secret-at-least-16";
  const token="123456789:ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcd1234";
  let stored={ telegram_bot_token_encrypted:"", telegram_bot_token_last4:"" };
  const db={
    prepare(sql){
      return {
        bind(...args){
          return {
            async first(){
              if(sql.includes("SELECT telegram_bot_token_encrypted,telegram_bot_token_last4")) return stored;
              if(sql.includes("SELECT c.*")) return { ...stored,has_line:0,line_enabled:0,telegram_enabled:1,telegram_chat_id:"55667788" };
              return null;
            },
            async run(){stored={telegram_bot_token_encrypted:args[4],telegram_bot_token_last4:args[5]};return {meta:{changes:1}};},
          };
        },
      };
    },
  };
  const first=await saveTaskChannels(db,"usr_1",{telegramBotToken:token,telegramChatId:"55667788",telegramEnabled:true},secret);
  assert.equal(first.telegramBotConfigured,true);
  assert.equal(first.telegramBotTokenLast4,"1234");
  assert.equal(stored.telegram_bot_token_encrypted.includes(token),false);
  assert.equal(await decryptTelegramBotToken(stored.telegram_bot_token_encrypted,secret),token);
  const encrypted=stored.telegram_bot_token_encrypted;
  await saveTaskChannels(db,"usr_1",{telegramBotToken:"",telegramChatId:"55667788",telegramEnabled:true},secret);
  assert.equal(stored.telegram_bot_token_encrypted,encrypted);
});