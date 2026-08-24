const encoder = new TextEncoder();
const TOKEN_PATTERN = /^\d{5,20}:[A-Za-z0-9_-]{20,120}$/;
const KEY_SALT = encoder.encode("akaffit-task-telegram-token-v1");
const KEY_INFO = encoder.encode("member-task-telegram-bot-token");

export function normalizeTelegramBotToken(token) {
  const value = String(token || "")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/：/g, ":")
    .trim();
  return value.match(/\d{5,20}:[A-Za-z0-9_-]{20,120}/)?.[0] || value;
}

const toBase64Url = (bytes) => btoa(String.fromCharCode(...bytes))
  .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");

const fromBase64Url = (value) => {
  const padded = String(value).replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  return Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
};

async function tokenEncryptionKey(secret) {
  const value = String(secret || "");
  if (value.length < 16) throw new Error("Telegram Token 加密金鑰尚未設定");
  const sourceKey = await crypto.subtle.importKey("raw", encoder.encode(value), "HKDF", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name:"HKDF", hash:"SHA-256", salt:KEY_SALT, info:KEY_INFO },
    sourceKey,
    { name:"AES-GCM", length:256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export function isValidTelegramBotToken(token) {
  return TOKEN_PATTERN.test(normalizeTelegramBotToken(token));
}

export async function encryptTelegramBotToken(token, secret) {
  const value = normalizeTelegramBotToken(token);
  if (!isValidTelegramBotToken(value)) throw new Error("Telegram Bot Token 格式錯誤");
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name:"AES-GCM", iv },
    await tokenEncryptionKey(secret),
    encoder.encode(value),
  );
  return `v1.${toBase64Url(iv)}.${toBase64Url(new Uint8Array(ciphertext))}`;
}

export async function decryptTelegramBotToken(payload, secret) {
  const [version, encodedIv, encodedCiphertext] = String(payload || "").split(".");
  if (version !== "v1" || !encodedIv || !encodedCiphertext) throw new Error("Telegram Bot Token 加密資料格式錯誤");
  const plaintext = await crypto.subtle.decrypt(
    { name:"AES-GCM", iv:fromBase64Url(encodedIv) },
    await tokenEncryptionKey(secret),
    fromBase64Url(encodedCiphertext),
  );
  const token = new TextDecoder().decode(plaintext);
  if (!isValidTelegramBotToken(token)) throw new Error("Telegram Bot Token 解密內容錯誤");
  return token;
}
