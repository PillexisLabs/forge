import assert from 'node:assert/strict';
import { test } from 'node:test';
import { sameFacts } from '../src/core/customers';
import type { CaseRecord } from '../src/core/jobs';
import { orderJob } from '../src/modules/orders/order-job';
import { quoteJob } from '../src/modules/sales/quote-job';

const base = { id: 1, ref: 'X-1', state: 'enquiry', title: 't', version: 1 } as unknown as CaseRecord;

test('a quote shares its buyer and delivery pincode with the CRM', () => {
  const facts = quoteJob.customerOf!({ ...base, subject: { buyerName: 'Meera Joshi', company: null, phone: '919740033445', email: null }, data: { enquiry: { channel: 'whatsapp', message: '' }, quote: { pincode: '560058' } } } as never);
  assert.deepEqual(facts, { name: 'Meera Joshi', company: null, phone: '919740033445', email: null, gstin: null, pincode: '560058' });
});

test('an order shares the buyer GSTIN with the CRM', () => {
  const facts = orderJob.customerOf!({ ...base, subject: { buyerName: 'Imran Khan', company: 'Khan Foods', phone: '919986012121' }, data: { pincode: '560045', buyerGstin: '29ABCDE1234F1Z5' } } as never);
  assert.equal(facts?.gstin, '29ABCDE1234F1Z5');
  assert.equal(facts?.email, null);
});

test('the engine emits customer.updated only when the details change', () => {
  const a = { name: 'A', company: null, phone: '91', email: null, gstin: null, pincode: '560001' };
  assert.equal(sameFacts(a, { ...a }), true);
  assert.equal(sameFacts(a, { ...a, pincode: '560002' }), false);
  assert.equal(sameFacts(a, null), false);
});
