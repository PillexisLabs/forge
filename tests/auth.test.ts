import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createSessionToken,
  verifySessionToken,
  SESSION_MAX_AGE_S,
} from '../src/core/auth';

const SECRET = 'test-secret';

test('a token round-trips to its claims', async () => {
  const token = await createSessionToken(SECRET, { id: 7, sessionVersion: 3 });
  const claims = await verifySessionToken(token, SECRET);

  assert.ok(claims);
  assert.equal(claims.userId, 7);
  assert.equal(claims.sessionVersion, 3);
});

test('a tampered payload is rejected', async () => {
  const token = await createSessionToken(SECRET, { id: 7, sessionVersion: 1 });
  const forged = token.replace('u.7.', 'u.8.');

  assert.equal(await verifySessionToken(forged, SECRET), null);
});

test('a token signed with another secret is rejected', async () => {
  const token = await createSessionToken('other-secret', { id: 1, sessionVersion: 1 });

  assert.equal(await verifySessionToken(token, SECRET), null);
});

test('an expired token is rejected, a fresh one is not', async () => {
  const issuedAt = Date.now();
  const token = await createSessionToken(SECRET, { id: 1, sessionVersion: 1 }, issuedAt);

  const justBefore = issuedAt + SESSION_MAX_AGE_S * 1000 - 1;
  const justAfter = issuedAt + SESSION_MAX_AGE_S * 1000 + 1;
  assert.ok(await verifySessionToken(token, SECRET, justBefore));
  assert.equal(await verifySessionToken(token, SECRET, justAfter), null);
});

test('the pre-RBAC single-user token format is rejected', async () => {
  // Old format: `auth.<timestamp>.<sig>` — a valid signature over the wrong
  // shape must not authenticate after the cutover.
  const legacyPayload = `auth.${Date.now()}`;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = Buffer.from(
    await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(legacyPayload)),
  )
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  assert.equal(await verifySessionToken(`${legacyPayload}.${sig}`, SECRET), null);
});

test('malformed and empty tokens are rejected', async () => {
  assert.equal(await verifySessionToken(undefined, SECRET), null);
  assert.equal(await verifySessionToken('', SECRET), null);
  assert.equal(await verifySessionToken('no-dots-here', SECRET), null);
  assert.equal(await verifySessionToken('u.0.1.123.sig', SECRET), null);
  const token = await createSessionToken(SECRET, { id: 1, sessionVersion: 1 });
  assert.equal(await verifySessionToken(token, ''), null);
});
