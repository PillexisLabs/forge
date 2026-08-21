import assert from 'node:assert/strict';
import test from 'node:test';
import { hasPermission } from '../src/core/permissions';
import type { SessionUser } from '../src/core/users';

function user(role: SessionUser['role'], modules: string[] = []): SessionUser {
  return {
    id: 1, email: 'test@example.com', name: 'Test', role, modules,
    sessionVersion: 1, status: 'active',
  };
}

test('the role matrix from plans/RBAC.md section 3', () => {
  // admin: everything.
  assert.ok(hasPermission(user('admin'), 'crm:read'));
  assert.ok(hasPermission(user('admin'), 'crm:write'));
  assert.ok(hasPermission(user('admin'), 'whatsapp:send'));
  assert.ok(hasPermission(user('admin'), 'core:users'));
  assert.ok(hasPermission(user('admin'), 'core:config'));

  // member: read, write, special actions — never core:*.
  assert.ok(hasPermission(user('member'), 'crm:read'));
  assert.ok(hasPermission(user('member'), 'crm:write'));
  assert.ok(hasPermission(user('member'), 'analytics:sync'));
  assert.ok(!hasPermission(user('member'), 'core:users'));
  assert.ok(!hasPermission(user('member'), 'core:config'));

  // viewer: read only.
  assert.ok(hasPermission(user('viewer'), 'crm:read'));
  assert.ok(!hasPermission(user('viewer'), 'crm:write'));
  assert.ok(!hasPermission(user('viewer'), 'whatsapp:send'));
  assert.ok(!hasPermission(user('viewer'), 'analytics:sync'));
  assert.ok(!hasPermission(user('viewer'), 'core:users'));
});

test('the module allowlist intersects every check', () => {
  const scoped = user('member', ['whatsapp', 'crm']);

  assert.ok(hasPermission(scoped, 'crm:write'));
  assert.ok(hasPermission(scoped, 'whatsapp:send'));
  assert.ok(!hasPermission(scoped, 'analytics:read'));
  assert.ok(!hasPermission(scoped, 'analytics:sync'));
});

test('an empty allowlist means all modules', () => {
  assert.ok(hasPermission(user('member', []), 'analytics:read'));
});

test('the allowlist never grants core access', () => {
  assert.ok(!hasPermission(user('member', ['crm']), 'core:users'));
});

test('a scoped admin keeps core but loses excluded modules', () => {
  const scopedAdmin = user('admin', ['crm']);

  assert.ok(hasPermission(scopedAdmin, 'core:users'));
  assert.ok(hasPermission(scopedAdmin, 'crm:write'));
  assert.ok(!hasPermission(scopedAdmin, 'analytics:read'));
});

test('malformed permission strings are denied', () => {
  assert.ok(!hasPermission(user('admin'), 'crm'));
  assert.ok(!hasPermission(user('admin'), ''));
  assert.ok(!hasPermission(user('admin'), ':write'));
});
