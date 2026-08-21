import assert from 'node:assert/strict';
import test from 'node:test';
import { checksumOf, orderMigrations } from '../scripts/migrate';

test('migrations run in numeric order', () => {
  const ordered = orderMigrations([
    '0010_add_owners.sql',
    '0002_add_events.sql',
    '0001_initial_schema.sql',
  ]);

  assert.deepEqual(ordered, [
    '0001_initial_schema.sql',
    '0002_add_events.sql',
    '0010_add_owners.sql',
  ]);
});

test('non-sql files are ignored', () => {
  assert.deepEqual(orderMigrations(['0001_initial_schema.sql', 'README.md', '.DS_Store']), [
    '0001_initial_schema.sql',
  ]);
});

test('a misnamed migration fails the run instead of being skipped', () => {
  assert.throws(
    () => orderMigrations(['0001_initial_schema.sql', 'add-owners.sql']),
    /must be named NNNN_lower_snake_case\.sql/,
  );
  assert.throws(() => orderMigrations(['1_initial.sql']), /must be named/);
  assert.throws(() => orderMigrations(['0001_Initial_Schema.sql']), /must be named/);
});

test('two branches adding the same sequence number is a hard error', () => {
  assert.throws(
    () => orderMigrations(['0001_initial_schema.sql', '0002_add_owners.sql', '0002_add_roles.sql']),
    /share sequence 0002/,
  );
});

test('checksums are stable and line-ending independent', () => {
  const unix = 'alter table crm_deals add column x int;\n';
  const windows = 'alter table crm_deals add column x int;\r\n';

  assert.equal(checksumOf(unix), checksumOf(windows));
  assert.equal(checksumOf(unix), checksumOf(unix));
  assert.notEqual(checksumOf(unix), checksumOf('alter table crm_deals add column y int;\n'));
});
