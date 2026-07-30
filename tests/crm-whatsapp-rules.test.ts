import assert from 'node:assert/strict';
import test from 'node:test';
import {
  confirmationMessage,
  resolveWhatsAppTransition,
} from '../src/lib/crm-whatsapp-rules';

test('starting a WhatsApp workflow queues confirmation immediately', () => {
  const now = new Date('2026-07-30T12:00:00.000Z');
  const transition = resolveWhatsAppTransition(
    'start',
    '2026-08-02T12:00:00.000Z',
    now,
  );

  assert.equal(transition.state, 'awaiting_confirmation');
  assert.equal(transition.enabled, true);
  assert.equal(transition.nextMessageAt, now.toISOString());
  assert.equal(transition.subject, 'WhatsApp confirmation queued');
});

test('confirmation schedules the 24 hour reminder when there is time', () => {
  const transition = resolveWhatsAppTransition(
    'confirm',
    '2026-08-02T12:00:00.000Z',
    new Date('2026-07-30T12:00:00.000Z'),
  );

  assert.equal(transition.state, 'confirmed');
  assert.equal(transition.nextMessageAt, '2026-08-01T12:00:00.000Z');
});

test('confirmation falls back to the 2 hour reminder', () => {
  const transition = resolveWhatsAppTransition(
    'confirm',
    '2026-07-30T18:00:00.000Z',
    new Date('2026-07-30T12:00:00.000Z'),
  );

  assert.equal(transition.nextMessageAt, '2026-07-30T16:00:00.000Z');
});

test('opt out stops all future workflow messages', () => {
  const transition = resolveWhatsAppTransition(
    'opt_out',
    '2026-08-02T12:00:00.000Z',
  );

  assert.equal(transition.state, 'opted_out');
  assert.equal(transition.enabled, false);
  assert.equal(transition.nextMessageAt, null);
});

test('confirmation copy uses the first name and IST appointment time', () => {
  const message = confirmationMessage(
    'Shubham Gupta',
    '2026-08-02T12:00:00.000Z',
  );

  assert.match(message, /^Hi Shubham,/);
  assert.match(message, /5:30 pm/);
  assert.match(message, /reply confirm/);
});
