import assert from 'node:assert/strict';
import test from 'node:test';
import type { Product } from '../src/core/products';
import { findPincode, isConfirmation, matchEnquiry } from '../src/modules/sales/enquiry-match';

const p = (sku: string, name: string, unit = 'pcs'): Product => ({
  sku, name, unit, ratePaise: 100, gstRateBp: 1800, hsn: null, onHand: 0, incomingLocal: 0, incomingImport: 0, committed: 0, available: 0,
});

const CATALOGUE = [
  p('SUP-250-2C', 'Stand-up pouch 250 ml, 2 colour'),
  p('SUP-500-4C', 'Stand-up pouch 500 ml, 4 colour'),
  p('ZIP-1KG-CL', 'Zipper pouch 1 kg, clear'),
  p('SPT-200', 'Spout pouch 200 ml'),
  p('BOPP-5KG', 'BOPP woven bag 5 kg'),
  p('LAM-12M', 'Laminated roll, 12 micron', 'kg'),
];

test('one item with size, print and quantity', () => {
  const m = matchEnquiry('Hi, need 5000 stand-up pouches 250 ml, 2 colour print. Delivery Peenya 560058. Please send rate.', CATALOGUE);
  assert.deepEqual(m.lines.map((l) => [l.sku, l.quantity]), [['SUP-250-2C', 5000]]);
  assert.equal(m.pincode, '560058');
});

test('two items joined by "and", with 5,000 and 5k forms', () => {
  const m = matchEnquiry('Please quote 6,000 stand-up pouches 250 ml and 3k zipper pouches 1 kg', CATALOGUE);
  assert.deepEqual(m.lines.map((l) => [l.sku, l.quantity]), [['SUP-250-2C', 6000], ['ZIP-1KG-CL', 3000]]);
  assert.equal(m.pincode, null);
});

test('the size is not read as a quantity', () => {
  const m = matchEnquiry('need 1200 spout pouches 200 ml', CATALOGUE);
  assert.deepEqual(m.lines.map((l) => [l.sku, l.quantity]), [['SPT-200', 1200]]);
});

test('a quantity given in a separate sentence', () => {
  const m = matchEnquiry('Need BOPP bags 5 kg for rice. Quantity 2000. Pin 575001', CATALOGUE);
  assert.deepEqual(m.lines.map((l) => [l.sku, l.quantity]), [['BOPP-5KG', 2000]]);
  assert.equal(m.pincode, '575001');
});

test('lakh quantities and a 6-digit quantity with a unit are quantities, not pincodes', () => {
  assert.deepEqual(matchEnquiry('1 lakh stand-up pouches 500 ml 4 colour', CATALOGUE).lines.map((l) => l.quantity), [100000]);
  assert.equal(findPincode('100000 pcs to 600032'), '600032');
});

test('an unclear item goes to a person, never a guess', () => {
  const m = matchEnquiry('need 5000 pouches', CATALOGUE);
  assert.equal(m.lines.length, 0);
  assert.deepEqual(m.unmatched, ['need 5000 pouches']);
});

test('confirmation replies', () => {
  assert.ok(isConfirmation('Ok confirmed, go ahead'));
  assert.ok(isConfirmation('confirm'));
  assert.ok(isConfirmation('Yes please proceed'));
  assert.ok(!isConfirmation('not confirmed yet, can you reduce the rate?'));
  assert.ok(!isConfirmation('Please wait, I will confirm tomorrow'));
  assert.ok(!isConfirmation('What is the delivery time?'));
});
