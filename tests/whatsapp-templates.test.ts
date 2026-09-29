import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SUGGESTED_TEMPLATES, templateVariables, validateTemplate } from '../src/modules/whatsapp/whatsapp-templates';

const base = { name: 'order_dispatched', category: 'UTILITY' as const, language: 'en', body: 'Hello {{1}}, order {{2}} is on its way today.', examples: ['Pooja', 'SO-1003'], footer: null };

test('template variables are read in order, once each', () => {
  assert.deepEqual(templateVariables('Hi {{2}} and {{1}}, again {{1}}.'), [1, 2]);
});

test('a valid template passes', () => {
  assert.equal(validateTemplate(base), null);
});

test('Meta rules are checked before the API call', () => {
  assert.match(validateTemplate({ ...base, name: 'Order Dispatched' })!, /lowercase/);
  assert.match(validateTemplate({ ...base, body: '{{1}}, your order is ready.' })!, /start or end/);
  assert.match(validateTemplate({ ...base, body: 'Your order is ready {{1}}' })!, /start or end/);
  assert.match(validateTemplate({ ...base, body: 'Hi {{1}}, order {{3}} is ready now.' })!, /in order/);
  assert.match(validateTemplate({ ...base, examples: ['Pooja'] })!, /sample value/);
});

test('every suggested template passes the checks', () => {
  for (const s of SUGGESTED_TEMPLATES) assert.equal(validateTemplate({ ...s, language: 'en' }), null, s.name);
});
