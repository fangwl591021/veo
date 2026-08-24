import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createSession,
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_SECONDS,
  sessionCookie,
  sessionTokenFromCookie,
  verifySession,
} from '../src/auth.js';

test('session can be verified with the same secret', async () => {
  const token = await createSession('usr_abc', 'test-secret', 1_000_000);
  const claims = await verifySession(token, 'test-secret', 1_000_001);
  assert.equal(claims.sub, 'usr_abc');
});

test('session fails when its signature is changed', async () => {
  const token = await createSession('usr_abc', 'test-secret', 1_000_000);
  assert.equal(await verifySession(`${token}x`, 'test-secret', 1_000_001), null);
});

test('session remains valid for 180 days and fails after expiry', async () => {
  const token = await createSession('usr_abc', 'test-secret', 1_000_000);
  assert.equal((await verifySession(token, 'test-secret', 1_000_000 + (SESSION_MAX_AGE_SECONDS - 1) * 1000)).sub, 'usr_abc');
  assert.equal(await verifySession(token, 'test-secret', 1_000_000 + (SESSION_MAX_AGE_SECONDS + 1) * 1000), null);
});

test('session cookie is secure, persistent and readable from a cookie header', () => {
  const cookie = sessionCookie('signed.token');
  assert.match(cookie, new RegExp(`^${SESSION_COOKIE_NAME}=signed.token;`));
  assert.match(cookie, /Max-Age=15552000/);
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /Secure/);
  assert.match(cookie, /SameSite=Lax/);
  assert.equal(sessionTokenFromCookie(`theme=light; ${SESSION_COOKIE_NAME}=signed.token; other=1`), 'signed.token');
  assert.match(sessionCookie('', 0), /Max-Age=0/);
});
