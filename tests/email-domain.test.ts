import assert from 'node:assert/strict';
import test from 'node:test';
import { emailDomainAllowed } from '../src/core/users';

test('only the workspace domain can sign in (default pillexislabs.com)', () => {
  delete process.env.AUTH_EMAIL_DOMAIN;
  assert.ok(emailDomainAllowed('anurag@pillexislabs.com'));
  assert.ok(emailDomainAllowed('  Priyanka@PillexisLabs.com  '));
  assert.ok(!emailDomainAllowed('anurag@gmail.com'));
  assert.ok(!emailDomainAllowed('anurag@pillexislabs.com.evil.com'));
  assert.ok(!emailDomainAllowed('anurag@notpillexislabs.com'));
});

test('AUTH_EMAIL_DOMAIN overrides the domain for client copies', () => {
  process.env.AUTH_EMAIL_DOMAIN = 'client.example';
  assert.ok(emailDomainAllowed('ops@client.example'));
  assert.ok(!emailDomainAllowed('anurag@pillexislabs.com'));
  delete process.env.AUTH_EMAIL_DOMAIN;
});

test("AUTH_EMAIL_DOMAIN='*' disables the restriction", () => {
  process.env.AUTH_EMAIL_DOMAIN = '*';
  assert.ok(emailDomainAllowed('anyone@anywhere.dev'));
  delete process.env.AUTH_EMAIL_DOMAIN;
});
