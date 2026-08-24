const encoder = new TextEncoder();
const decoder = new TextDecoder();
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 180;
export const SESSION_COOKIE_NAME = 'akaffit_session';

export function base64UrlEncode(value) {
  const bytes = value instanceof Uint8Array ? value : encoder.encode(value);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

export function base64UrlDecode(value) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(normalized + '='.repeat((4 - normalized.length % 4) % 4));
  return Uint8Array.from(binary, character => character.charCodeAt(0));
}

async function hmac(value, secret) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(value)));
}

function constantTimeEqual(left, right) {
  if (left.length !== right.length) return false;
  let result = 0;
  for (let index = 0; index < left.length; index += 1) result |= left[index] ^ right[index];
  return result === 0;
}

export async function createSession(userId, secret, now = Date.now()) {
  const payload = base64UrlEncode(JSON.stringify({ sub: userId, iat: Math.floor(now / 1000), exp: Math.floor(now / 1000) + SESSION_MAX_AGE_SECONDS }));
  const signature = base64UrlEncode(await hmac(payload, secret));
  return `${payload}.${signature}`;
}

export function sessionTokenFromCookie(cookieHeader = '') {
  for (const part of String(cookieHeader).split(';')) {
    const separator = part.indexOf('=');
    if (separator < 0) continue;
    const name = part.slice(0, separator).trim();
    if (name !== SESSION_COOKIE_NAME) continue;
    try { return decodeURIComponent(part.slice(separator + 1).trim()); }
    catch { return ''; }
  }
  return '';
}

export function sessionCookie(token, maxAge = SESSION_MAX_AGE_SECONDS) {
  const value = token ? encodeURIComponent(token) : '';
  return `${SESSION_COOKIE_NAME}=${value}; Path=/; Max-Age=${Math.max(0, Number(maxAge) || 0)}; HttpOnly; Secure; SameSite=Lax`;
}

export async function verifySession(token, secret, now = Date.now()) {
  const [payload, signature] = String(token || '').split('.');
  if (!payload || !signature) return null;
  const expected = await hmac(payload, secret);
  if (!constantTimeEqual(base64UrlDecode(signature), expected)) return null;
  try {
    const claims = JSON.parse(decoder.decode(base64UrlDecode(payload)));
    if (!claims.sub || !Number.isInteger(claims.exp) || claims.exp * 1000 <= now) return null;
    return claims;
  } catch {
    return null;
  }
}

export async function sha256(value) {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(value));
  return base64UrlEncode(new Uint8Array(digest));
}

export async function verifyLineIdToken(idToken, channelId) {
  if (!idToken || !channelId) return null;
  const form = new URLSearchParams();
  form.set('id_token', idToken);
  form.set('client_id', channelId);
  const response = await fetch('https://api.line.me/oauth2/v2.1/verify', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: form.toString()
  });
  if (!response.ok) return null;
  const profile = await response.json();
  return typeof profile.sub === 'string' && profile.sub ? profile : null;
}

export async function verifyLineAccessToken(accessToken) {
  if (!accessToken) return null;
  const response = await fetch('https://api.line.me/v2/profile', {
    headers: { authorization: `Bearer ${accessToken}` }
  });
  if (!response.ok) return null;
  const profile = await response.json();
  return typeof profile.userId === 'string' && profile.userId
    ? { sub: profile.userId, name: profile.displayName || '', picture: profile.pictureUrl || '' }
    : null;
}
