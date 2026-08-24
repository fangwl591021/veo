import { isValidTelegramBotToken, normalizeTelegramBotToken } from "./telegram-token-crypto.js";

const TELEGRAM_API_ROOT = "https://api.telegram.org";

async function telegramCall(token, method, body = {}, fetchImpl = fetch) {
  const response = await fetchImpl(`${TELEGRAM_API_ROOT}/bot${token}/${method}`, {
    method:"POST",
    headers:{"content-type":"application/json"},
    body:JSON.stringify(body),
  });
  const payload = await response.json().catch(()=>({}));
  if (!response.ok || payload.ok !== true) {
    const error = new Error(String(payload.description || `Telegram HTTP ${response.status}`));
    error.telegramStatus = response.status;
    throw error;
  }
  return payload.result;
}

export async function discoverTelegramPrivateChat(token, fetchImpl = fetch) {
  const normalizedToken = normalizeTelegramBotToken(token);
  if (!isValidTelegramBotToken(normalizedToken)) throw new Error("Bot Token 格式不正確，請重新從 BotFather 完整複製");
  let bot;
  try {
    bot = await telegramCall(normalizedToken, "getMe", {}, fetchImpl);
  } catch (error) {
    if ([401,404].includes(error.telegramStatus)) throw new Error("Bot Token 無效，請重新從 BotFather 完整複製");
    throw new Error("Telegram 暫時無法驗證，請稍後再試");
  }
  const botName = bot?.username ? `@${bot.username}` : "你的 Bot";
  const webhook = await telegramCall(normalizedToken, "getWebhookInfo", {}, fetchImpl);
  if (webhook?.url) throw new Error(`${botName} 已連接其他 webhook 服務；請使用沒有連接其他系統的新 Bot`);
  const updates = await telegramCall(normalizedToken, "getUpdates", {
    limit:50,
    timeout:3,
    allowed_updates:["message","edited_message","business_message"],
  }, fetchImpl);
  const latest = (Array.isArray(updates) ? updates : [])
    .flatMap((update)=>[update?.message,update?.edited_message,update?.business_message])
    .filter((message)=>message?.chat?.type==="private"&&message.chat.id!=null)
    .sort((a,b)=>Number(b.date||0)-Number(a.date||0))[0];
  if (!latest) throw new Error(`Token 已確認是 ${botName}，但尚未收到私人訊息。請先在 ${botName} 傳送 /start，再傳一則「測試」後重試`);
  const chat=latest.chat;
  const displayName=[chat.first_name,chat.last_name].filter(Boolean).join(" ").trim()||(chat.username?`@${chat.username}`:"Telegram 使用者");
  return { chatId:String(chat.id), displayName, botName };
}

export async function sendTelegramTaskTest(token, chatId, fetchImpl = fetch) {
  const normalizedToken=normalizeTelegramBotToken(token);
  const normalizedChatId=String(chatId||"").trim();
  if (!isValidTelegramBotToken(normalizedToken)) throw new Error("Bot Token 無效，請重新輸入或先儲存設定");
  if (!/^-?\d{5,20}$/.test(normalizedChatId)) throw new Error("Chat ID 格式不正確，請先自動取得 ID");
  try {
    const result=await telegramCall(normalizedToken,"sendMessage",{
      chat_id:normalizedChatId,
      text:"✅ A’kaffit AI 任務推播測試成功\n你的個人任務提醒已可正常傳送。",
      disable_web_page_preview:true,
    },fetchImpl);
    return { messageId:String(result?.message_id||"") };
  } catch (error) {
    if (error.telegramStatus===400) throw new Error("Chat ID 無法接收訊息，請重新自動取得 ID");
    if ([401,404].includes(error.telegramStatus)) throw new Error("Bot Token 無效，請重新從 BotFather 複製");
    if (error.telegramStatus===403) throw new Error("Bot 無法傳送訊息；請確認沒有封鎖 Bot，並重新按 Start");
    throw new Error("Telegram 測試暫時失敗，請稍後再試");
  }
}
