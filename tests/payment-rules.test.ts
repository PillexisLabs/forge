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

import { allocate, instalmentsFor, startDueDates, termsFor } from '../src/modules/orders/payment-settings';

test('terms become instalments: after dispatch, advance and balance, full advance', () => {
  const at = new Date('2026-10-01T00:00:00Z');
  const after = instalmentsFor(100_000, { mode: 'after_dispatch', advancePercent: 30, advanceDays: 0, balanceDays: 30 }, at);
  assert.equal(after.length, 1);
  assert.equal(after[0].dueAt, null);
  const split = instalmentsFor(100_001, { mode: 'advance_balance', advancePercent: 30, advanceDays: 2, balanceDays: 15 }, at);
  assert.deepEqual(split.map((i) => [i.key, i.amountPaise]), [['advance', 30_000], ['balance', 70_001]]);
  assert.equal(split[0].dueAt, '2026-10-03T00:00:00.000Z');
  const full = instalmentsFor(100_000, { mode: 'full_advance', advancePercent: 0, advanceDays: 0, balanceDays: 0 }, at);
  assert.equal(full[0].dueAt, '2026-10-01T00:00:00.000Z');
});

test('payments fill instalments in order, and dispatch starts the balance due date', () => {
  const split = instalmentsFor(100_000, { mode: 'advance_balance', advancePercent: 30, advanceDays: 0, balanceDays: 15 }, new Date('2026-10-01T00:00:00Z'));
  assert.deepEqual(allocate(split, 40_000).map((i) => i.paidPaise), [30_000, 10_000]);
  const dispatched = startDueDates(split, 'dispatch', new Date('2026-10-10T00:00:00Z'));
  assert.equal(dispatched[1].dueAt, '2026-10-25T00:00:00.000Z');
  assert.equal(dispatched[0].dueAt, split[0].dueAt);
});

test('customer terms match by phone, email or company name', () => {
  const rules = { ...DEFAULT_PAYMENT_RULES, customerTerms: [
    { id: '1', name: 'Nair Coffee', match: '98451 88990', mode: 'full_advance' as const, advancePercent: 0, advanceDays: 0, balanceDays: 0 },
    { id: '2', name: 'Rao Agro', match: 'rao agro', mode: 'advance_balance' as const, advancePercent: 50, advanceDays: 0, balanceDays: 45 },
  ] };
  assert.equal(termsFor(rules, { phone: '919845188990' }).source, 'Nair Coffee');
  assert.equal(termsFor(rules, { company: 'Rao Agro Exports' }).advancePercent, 50);
  assert.equal(termsFor(rules, { company: 'Someone else' }).source, 'default');
});

import { splitGst, stateFromGstin, stateFromPincode } from '../src/modules/orders/gst';
import { financialYear } from '../src/core/numbering';

test('GST: CGST and SGST inside the state, IGST across states', () => {
  assert.deepEqual(splitGst(3_061, '29', '29'), { cgst: 1_530, sgst: 1_531, igst: 0 });
  assert.deepEqual(splitGst(3_060, '29', '33'), { cgst: 0, sgst: 0, igst: 3_060 });
  assert.equal(stateFromGstin('29ABCDE1234F1Z5'), '29');
  assert.equal(stateFromPincode('560058'), '29');
  assert.equal(stateFromPincode('600032'), '33');
  assert.equal(stateFromPincode('403001'), '30');
});

test('financial years run April to March in IST', () => {
  assert.equal(financialYear(new Date('2026-09-29T10:00:00Z')), '2026-27');
  assert.equal(financialYear(new Date('2027-03-31T17:00:00Z')), '2026-27');
  assert.equal(financialYear(new Date('2027-03-31T19:00:00Z')), '2027-28');
});
