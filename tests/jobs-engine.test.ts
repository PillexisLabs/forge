import assert from 'node:assert/strict';
import test from 'node:test';
import { availableSteps, checkStep, ruleActor, StepError, userActor } from '../src/core/jobs';
import type { SessionUser } from '../src/core/users';
import { orderJob } from '../src/modules/orders/order-job';
import { quoteJob } from '../src/modules/sales/quote-job';

function user(role: SessionUser['role'], modules: string[] = []): SessionUser {
  return { id: 1, email: 't@example.com', name: 'Test', role, modules, sessionVersion: 1, status: 'active' };
}

function status(fn: () => unknown): number | null {
  try {
    fn();
    return null;
  } catch (error) {
    return error instanceof StepError ? error.status : -1;
  }
}

test('a step runs only from the states it lists', () => {
  const sales = userActor(user('member'));
  assert.equal(status(() => checkStep(quoteJob, 'draft', 'submitQuote', sales)), null);
  assert.equal(status(() => checkStep(quoteJob, 'enquiry', 'submitQuote', sales)), 409);
  assert.equal(status(() => checkStep(quoteJob, 'accepted', 'markLost', sales)), 409);
  assert.equal(status(() => checkStep(quoteJob, 'draft', 'noSuchStep', sales)), 404);
});

test('a creating step cannot run on an existing case', () => {
  assert.equal(status(() => checkStep(quoteJob, 'draft', 'recordEnquiry', userActor(user('member')))), 409);
  assert.equal(status(() => checkStep(quoteJob, null, 'recordEnquiry', userActor(user('member')))), null);
});

test('only an approver approves, and a viewer changes nothing', () => {
  assert.equal(status(() => checkStep(quoteJob, 'awaiting_approval', 'approveQuote', userActor(user('member')))), 403);
  assert.equal(status(() => checkStep(quoteJob, 'awaiting_approval', 'approveQuote', userActor(user('admin')))), null);
  assert.equal(status(() => checkStep(quoteJob, 'draft', 'draftQuote', userActor(user('viewer')))), 403);
});

test('the module allowlist applies to steps', () => {
  const ordersOnly = userActor(user('member', ['orders']));
  assert.equal(status(() => checkStep(quoteJob, 'draft', 'draftQuote', ordersOnly)), 403);
  assert.equal(status(() => checkStep(orderJob, 'confirmed', 'dispatchOrder', ordersOnly)), null);
});

test('actor kinds: an order is created only by the rule, and no step accepts an AI employee yet', () => {
  const rule = ruleActor('orders.from-accepted-quote', 'Order rule');
  assert.equal(status(() => checkStep(orderJob, null, 'createFromQuote', rule)), null);
  assert.equal(status(() => checkStep(orderJob, null, 'createFromQuote', userActor(user('admin')))), 403);
  const employee = { kind: 'employee' as const, id: 'sales-1', name: 'Sales employee' };
  for (const [name, def] of Object.entries(quoteJob.steps)) {
    const from = def.from[0] ?? null;
    assert.equal(status(() => checkStep(quoteJob, from, name, employee)), 403, name);
  }
});

test('the case screen offers only the steps the user can run now', () => {
  const member = availableSteps(quoteJob, 'awaiting_approval', user('member')).map((s) => s.name);
  assert.deepEqual(member.sort(), ['addMessage', 'markHandled', 'markLost', 'sendReply']);
  const admin = availableSteps(quoteJob, 'awaiting_approval', user('admin')).map((s) => s.name);
  assert.deepEqual(admin.sort(), ['addMessage', 'approveQuote', 'markHandled', 'markLost', 'returnQuote', 'sendReply']);
});

test('rules may draft, send and accept, but never approve', () => {
  const rule = ruleActor('sales.match', 'Matching rule');
  assert.equal(status(() => checkStep(quoteJob, 'enquiry', 'draftQuote', rule)), null);
  assert.equal(status(() => checkStep(quoteJob, 'approved', 'markSent', rule)), null);
  assert.equal(status(() => checkStep(quoteJob, 'sent', 'markAccepted', rule)), null);
  assert.equal(status(() => checkStep(quoteJob, 'draft', 'submitQuote', rule)), 403);
  assert.equal(status(() => checkStep(quoteJob, 'awaiting_approval', 'approveQuote', rule)), 403);
});

test('every step targets only declared states', () => {
  for (const def of [quoteJob, orderJob]) {
    for (const [name, step] of Object.entries(def.steps)) {
      for (const state of [...step.from, ...step.to]) {
        assert.ok(def.states[state], `${def.job}.${name} names unknown state ${state}`);
      }
    }
  }
});
