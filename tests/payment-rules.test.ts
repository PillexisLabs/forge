import assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_PAYMENT_RULES, dueReminder } from '../src/modules/orders/payment-settings';

const due = new Date('2026-10-30T00:00:00Z');
const at = (iso: string) => new Date(iso);

test('no reminder before the first one falls due', () => {
  assert.equal(dueReminder(due, at('2026-10-20T00:00:00Z'), DEFAULT_PAYMENT_RULES, []), null);
});

test('the before, due and overdue reminders, each once', () => {
  assert.equal(dueReminder(due, at('2026-10-28T00:00:00Z'), DEFAULT_PAYMENT_RULES, [])?.key, 'before');
  assert.equal(dueReminder(due, at('2026-10-28T00:00:00Z'), DEFAULT_PAYMENT_RULES, ['before']), null);
  assert.equal(dueReminder(due, at('2026-10-30T09:00:00Z'), DEFAULT_PAYMENT_RULES, ['before'])?.key, 'due');
  assert.equal(dueReminder(due, at('2026-11-07T00:00:00Z'), DEFAULT_PAYMENT_RULES, ['before', 'due'])?.key, 'overdue-1');
});

test('a backlog sends only the latest reminder, not a burst', () => {
  assert.equal(dueReminder(due, at('2026-11-21T00:00:00Z'), DEFAULT_PAYMENT_RULES, [])?.key, 'overdue-3');
});

test('reminders switched off, and the overdue limit', () => {
  assert.equal(dueReminder(due, at('2026-11-07T00:00:00Z'), { ...DEFAULT_PAYMENT_RULES, remindersOn: false }, []), null);
  const rules = { ...DEFAULT_PAYMENT_RULES, maxOverdueReminders: 2 };
  assert.equal(dueReminder(due, at('2027-03-01T00:00:00Z'), rules, ['overdue-2']), null);
});
