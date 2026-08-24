import assert from "node:assert/strict";
import test from "node:test";
import {
  decryptTelegramBotToken,
  encryptTelegramBotToken,
  normalizeTelegramBotToken,
} from "../src/telegram-token-crypto.js";
import {
  discoverTelegramPrivateChat,
  sendTelegramTaskTest,
} from "../src/telegram-task-notifications.js";

const BOT_TOKEN = "123456789:ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcd1234";
const ENCRYPTION_SECRET = "test-session-signing-secret-at-least-16";

test("member Telegram Bot Token is normalized and encrypted at rest", async () => {
  const pasted=`Bot Token：\u200B${BOT_TOKEN}\n`;
  assert.equal(normalizeTelegramBotToken(pasted),BOT_TOKEN);
  const encrypted=await encryptTelegramBotToken(pasted,ENCRYPTION_SECRET);
  assert.match(encrypted,/^v1\./);
  assert.equal(encrypted.includes(BOT_TOKEN),false);
  assert.equal(await decryptTelegramBotToken(encrypted,ENCRYPTION_SECRET),BOT_TOKEN);
});

test("Telegram Chat ID discovery returns the latest private conversation", async () => {
  const result=await discoverTelegramPrivateChat(BOT_TOKEN,async (url,options)=>{
    if(url.endsWith("/getMe")) return {ok:true,status:200,json:async()=>({ok:true,result:{username:"akaffit_task_bot"}})};
    if(url.endsWith("/getWebhookInfo")) return {ok:true,status:200,json:async()=>({ok:true,result:{url:""}})};
    assert.deepEqual(JSON.parse(options.body).allowed_updates,["message","edited_message","business_message"]);
    return {ok:true,status:200,json:async()=>({ok:true,result:[
      {message:{date:100,chat:{id:-1001,type:"group"}}},
      {message:{date:200,chat:{id:55667788,type:"private",first_name:"Tony"}}},
    ]})};
  });
  assert.deepEqual(result,{chatId:"55667788",displayName:"Tony",botName:"@akaffit_task_bot"});
});

test("Telegram personal task test sends through the member Bot", async () => {
  let requestBody;
  const result=await sendTelegramTaskTest(BOT_TOKEN,"55667788",async (url,options)=>{
    assert.match(url,/\/sendMessage$/);
    requestBody=JSON.parse(options.body);
    return {ok:true,status:200,json:async()=>({ok:true,result:{message_id:99}})};
  });
  assert.equal(requestBody.chat_id,"55667788");
  assert.match(requestBody.text,/A’kaffit AI 任務推播測試成功/);
  assert.deepEqual(result,{messageId:"99"});
});
