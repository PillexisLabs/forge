import assert from 'node:assert/strict';
import test from 'node:test';
import {
  callEligibility,
  isInsideCallWindow,
  nextCallTime,
  parseCallWindow,
} from '../src/modules/voice/voice-rules';

test('only consented leads with a phone are callable', () => {
  assert.deepEqual(
    callEligibility({ phone: '+919999999999', consentStatus: 'granted' }),
    { eligible: true },
  );
  assert.deepEqual(
    callEligibility({ phone: '+919999999999', consentStatus: 'opted_out' }),
    { eligible: false, reason: 'opted_out' },
  );
  assert.deepEqual(
    callEligibility({ phone: '+919999999999', consentStatus: 'unknown' }),
    { eligible: false, reason: 'no_consent' },
  );
  assert.deepEqual(
    callEligibility({ phone: null, consentStatus: 'granted' }),
    { eligible: false, reason: 'no_phone' },
  );
  assert.deepEqual(
    callEligibility({ phone: '   ', consentStatus: 'granted' }),
    { eligible: false, reason: 'no_phone' },
  );
});

test('the call window parses and falls back to 10-19', () => {
  assert.deepEqual(parseCallWindow('11-18'), { startHour: 11, endHour: 18 });
  assert.deepEqual(parseCallWindow(undefined), { startHour: 10, endHour: 19 });
  assert.deepEqual(parseCallWindow('19-10'), { startHour: 10, endHour: 19 });
  assert.deepEqual(parseCallWindow('banana'), { startHour: 10, endHour: 19 });
});

test('window membership is judged in IST', () => {
  const window = parseCallWindow('10-19');
  // 06:30 UTC = 12:00 IST — inside.
  assert.ok(isInsideCallWindow(new Date('2026-08-21T06:30:00Z'), window));
  // 16:00 UTC = 21:30 IST — outside.
  assert.ok(!isInsideCallWindow(new Date('2026-08-21T16:00:00Z'), window));
  // 03:30 UTC = 09:00 IST — before opening.
  assert.ok(!isInsideCallWindow(new Date('2026-08-21T03:30:00Z'), window));
});

test('nextCallTime returns now inside the window, else the next opening', () => {
  const window = parseCallWindow('10-19');

  const inside = new Date('2026-08-21T06:30:00Z'); // 12:00 IST
  assert.equal(nextCallTime(inside, window).getTime(), inside.getTime());

  // 09:00 IST -> today 10:00 IST (04:30 UTC).
  const early = new Date('2026-08-21T03:30:00Z');
  assert.equal(nextCallTime(early, window).toISOString(), '2026-08-21T04:30:00.000Z');

  // 21:30 IST -> tomorrow 10:00 IST.
  const late = new Date('2026-08-21T16:00:00Z');
  assert.equal(nextCallTime(late, window).toISOString(), '2026-08-22T04:30:00.000Z');
});
