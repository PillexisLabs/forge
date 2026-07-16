// HMAC-signed session token using the Web Crypto API so it works in both the
// Edge middleware and Node route handlers. Single-user: any valid signature
// (created after a correct password) counts as authenticated.

const enc = new TextEncoder();

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

export async function createToken(secret: string): Promise<string> {
  const payload = `auth.${Date.now()}`;
  const key = await hmacKey(secret);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(payload));
  return `${payload}.${b64url(sig)}`;
}

export async function verifyToken(token: string | undefined, secret: string): Promise<boolean> {
  if (!token || !secret) return false;
  const idx = token.lastIndexOf('.');
  if (idx < 0) return false;
  const payload = token.slice(0, idx);
  const sig = token.slice(idx + 1);
  const key = await hmacKey(secret);
  const expected = b64url(await crypto.subtle.sign('HMAC', key, enc.encode(payload)));
  return expected === sig;
}

export const SESSION_COOKIE = 'dash_session';
