// HMAC-signed session token using the Web Crypto API so it works in both the
// Edge middleware and Node route handlers. The payload carries the user id,
// the user's session_version, and the issue time: `u.<uid>.<sv>.<iat>.<sig>`.
//
// Verification here is stateless (signature + expiry) because the Edge
// middleware cannot reach Postgres. The database-backed checks — does the
// user still exist, is it active, does session_version still match — live in
// src/core/session.ts and run in the Node layer on every request that acts.

const enc = new TextEncoder();

export const SESSION_COOKIE = 'dash_session';
export const SESSION_MAX_AGE_S = 30 * 24 * 60 * 60;

export type SessionClaims = {
  userId: number;
  sessionVersion: number;
  issuedAt: number; // epoch ms
};

async function hmacKey(secret: string) {
  return crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
}

function b64url(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let str = '';
  for (const b of bytes) str += String.fromCharCode(b);
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function createSessionToken(
  secret: string,
  user: { id: number; sessionVersion: number },
  issuedAt = Date.now(),
): Promise<string> {
  const payload = `u.${user.id}.${user.sessionVersion}.${issuedAt}`;
  const key = await hmacKey(secret);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(payload));
  return `${payload}.${b64url(sig)}`;
}

/** Signature + shape + expiry only. Null means "send them to /login". */
export async function verifySessionToken(
  token: string | undefined,
  secret: string,
  now = Date.now(),
): Promise<SessionClaims | null> {
  if (!token || !secret) return null;
  const idx = token.lastIndexOf('.');
  if (idx < 0) return null;
  const payload = token.slice(0, idx);
  const sig = token.slice(idx + 1);

  const key = await hmacKey(secret);
  const expected = b64url(await crypto.subtle.sign('HMAC', key, enc.encode(payload)));
  if (expected !== sig) return null;

  const parts = payload.split('.');
  if (parts.length !== 4 || parts[0] !== 'u') return null;
  const userId = Number(parts[1]);
  const sessionVersion = Number(parts[2]);
  const issuedAt = Number(parts[3]);
  if (!Number.isInteger(userId) || userId < 1) return null;
  if (!Number.isInteger(sessionVersion) || sessionVersion < 1) return null;
  if (!Number.isFinite(issuedAt)) return null;
  if (now - issuedAt > SESSION_MAX_AGE_S * 1000) return null;

  return { userId, sessionVersion, issuedAt };
}
