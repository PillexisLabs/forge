import assert from 'node:assert/strict';
import test from 'node:test';
import {
  classifyInboundIntent,
  confirmationMessage,
  inboundAck,
  resolveDueSend,
  resolveWhatsAppTransition,
  whatsAppTransitionError,
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

test('consent gates every transition that enables sending, not just start', () => {
  for (const consent of ['unknown', 'opted_out'] as const) {
    const error = whatsAppTransitionError('confirm', {
      consentStatus: consent,
      primaryPhone: '+91 90000 00011',
      appointmentAt: '2026-08-02T12:00:00.000Z',
    });
    assert.notEqual(error, null, `confirm must be blocked when consent is ${consent}`);
  }
});

test('opt out locks the workflow against every other action', () => {
  for (const action of ['start', 'confirm', 'reschedule', 'handoff', 'attended', 'pause'] as const) {
    const error = whatsAppTransitionError(action, {
      consentStatus: 'opted_out',
      primaryPhone: '+91 90000 00011',
      appointmentAt: '2026-08-02T12:00:00.000Z',
    });
    assert.equal(error, 'opted_out_locked', `${action} must be locked after opt out`);
  }
  assert.equal(whatsAppTransitionError('opt_out', {
    consentStatus: 'opted_out',
    primaryPhone: null,
    appointmentAt: null,
  }), null);
});

test('start still requires phone, consent, and appointment', () => {
  const base = {
    consentStatus: 'granted' as const,
    primaryPhone: '+91 90000 00011',
    appointmentAt: '2026-08-02T12:00:00.000Z',
  };
  assert.equal(whatsAppTransitionError('start', base), null);
  assert.equal(whatsAppTransitionError('start', { ...base, primaryPhone: null }), 'phone_required');
  assert.equal(whatsAppTransitionError('start', { ...base, consentStatus: 'unknown' }), 'consent_required');
  assert.equal(whatsAppTransitionError('start', { ...base, appointmentAt: null }), 'appointment_required');
});

test('due send: first touch is the confirmation, with one nudge scheduled', () => {
  const plan = resolveDueSend({
    state: 'awaiting_confirmation',
    contactName: 'Riya Sharma',
    appointmentAt: '2026-08-05T06:30:00.000Z',
    sendCount: 0,
    now: new Date('2026-08-01T10:00:00.000Z'),
  });
  assert.ok(plan);
  assert.match(plan!.body, /^Hi Riya,.*reply confirm/s);
  assert.equal(plan!.nextState, 'awaiting_confirmation');
  assert.equal(plan!.nextMessageAt, '2026-08-02T10:00:00.000Z');
});

test('due send: second touch is the nudge, then the queue goes quiet', () => {
  const plan = resolveDueSend({
    state: 'awaiting_confirmation',
    contactName: 'Riya Sharma',
    appointmentAt: '2026-08-05T06:30:00.000Z',
    sendCount: 1,
    now: new Date('2026-08-02T10:00:00.000Z'),
  });
  assert.ok(plan);
  assert.match(plan!.body, /just checking/);
  assert.equal(plan!.nextMessageAt, null);
});

test('due send: confirmed far from the call sends the 24h reminder and queues the 2h one', () => {
  const plan = resolveDueSend({
    state: 'confirmed',
    contactName: 'Riya Sharma',
    appointmentAt: '2026-08-02T06:30:00.000Z',
    sendCount: 2,
    now: new Date('2026-08-01T06:30:00.000Z'),
  });
  assert.ok(plan);
  assert.match(plan!.body, /reminder/i);
  assert.equal(plan!.nextState, 'confirmed');
  assert.equal(plan!.nextMessageAt, '2026-08-02T04:30:00.000Z');
});

test('due send: the 2h attendance check ends the automated sequence', () => {
  const plan = resolveDueSend({
    state: 'confirmed',
    contactName: 'Riya Sharma',
    appointmentAt: '2026-08-02T06:30:00.000Z',
    sendCount: 3,
    now: new Date('2026-08-02T04:30:00.000Z'),
  });
  assert.ok(plan);
  assert.match(plan!.body, /Will you be able to join/);
  assert.equal(plan!.nextState, 'attending');
  assert.equal(plan!.nextMessageAt, null);
});

test('due send: non-sending states clear instead of sending', () => {
  for (const state of ['attended', 'paused', 'human_handoff', 'opted_out'] as const) {
    assert.equal(resolveDueSend({
      state,
      contactName: 'Riya Sharma',
      appointmentAt: '2026-08-02T06:30:00.000Z',
      sendCount: 1,
    }), null, `${state} must not produce a send`);
  }
});

test('inbound intent: keywords map to actions, free-form escalates', () => {
  assert.equal(classifyInboundIntent('Confirm. Looking forward to it.'), 'confirm');
  assert.equal(classifyInboundIntent('yes'), 'confirm');
  assert.equal(classifyInboundIntent('ok done'), 'confirm');
  assert.equal(classifyInboundIntent('Can we reschedule to Monday?'), 'reschedule');
  assert.equal(classifyInboundIntent('need another time'), 'reschedule');
  assert.equal(classifyInboundIntent('STOP'), 'opt_out');
  assert.equal(classifyInboundIntent('please opt out'), 'opt_out');
  assert.equal(classifyInboundIntent('What would this cost for two warehouses?'), 'handoff');
  assert.equal(classifyInboundIntent('[image message]'), 'handoff');
});

test('inbound acks match the intent', () => {
  assert.match(inboundAck('confirm', 'Riya Sharma', 'https://cal.test')!, /^Thanks Riya.*locked in/);
  assert.match(inboundAck('reschedule', 'Riya Sharma', 'https://cal.test')!, /https:\/\/cal\.test/);
  assert.match(inboundAck('opt_out', 'Riya Sharma', 'https://cal.test')!, /not receive any more/);
  assert.match(inboundAck('handoff', 'Riya Sharma', 'https://cal.test')!, /Anurag will reply/);
});

test('no-show queues the recovery message immediately', () => {
  const transition = resolveWhatsAppTransition('no_show', '2026-08-02T12:00:00.000Z', new Date('2026-08-02T12:30:00.000Z'));
  assert.equal(transition.state, 'no_show');
  assert.equal(transition.enabled, true);
  assert.equal(transition.nextMessageAt, '2026-08-02T12:30:00.000Z');
});

test('no-show recovery sends the rebooking link once, then goes quiet', () => {
  const plan = resolveDueSend({
    state: 'no_show',
    contactName: 'Meera Pillai',
    appointmentAt: '2026-08-02T12:00:00.000Z',
    sendCount: 3,
    rescheduleLink: 'https://cal.test/rebook',
  });
  assert.ok(plan);
  assert.match(plan!.body, /missed you/);
  assert.match(plan!.body, /https:\/\/cal\.test\/rebook/);
  assert.equal(plan!.nextMessageAt, null);
});
