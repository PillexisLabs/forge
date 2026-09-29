import assert from 'node:assert/strict';
import test from 'node:test';
import type { Product } from '../src/core/products';
import { formatPaise } from '../src/core/money';
import { availabilityFor, deliveryPhrase, freightFor, isPincode, needsApproval, priceQuote } from '../src/modules/sales/quote-rules';

function product(sku: string, rupees: number, gstBp = 1800): Product {
  return {
    sku, name: sku, unit: 'pcs', ratePaise: Math.round(rupees * 100), gstRateBp: gstBp, hsn: '3923',
    onHand: 0, incomingLocal: 0, incomingImport: 0, incomingLocalEta: null, incomingImportEta: null, committed: 0, available: 0,
  };
}

const FREIGHT = { localPinPrefixes: ['56', '57'], localRupees: 1200, outstationRupees: 2500 };

test('the worked example from the plan: 5,000 pouches at ₹3.40 to 560058 is ₹21,260', () => {
  const quote = priceQuote([{ sku: 'SUP-250-2C', quantity: 5000 }], [product('SUP-250-2C', 3.4)], {
    pincode: '560058', freight: FREIGHT, version: 1, validDays: 7, priceSource: 'test',
  });
  assert.equal(quote.subtotalPaise, 1_700_000);
  assert.equal(quote.gstPaise, 306_000);
  assert.equal(quote.freightPaise, 120_000);
  assert.equal(quote.totalPaise, 2_126_000);
  assert.equal(formatPaise(quote.totalPaise), '₹21,260');
});

test('GST rounds per line to the paisa, and totals add exactly', () => {
  const quote = priceQuote(
    [{ sku: 'A', quantity: 3 }, { sku: 'B', quantity: 7 }],
    [product('A', 3.33), product('B', 0.07, 1200)],
    { pincode: '110001', freight: FREIGHT, version: 2, validDays: 7, priceSource: 'test' },
  );
  assert.equal(quote.lines[0].amountPaise, 999);
  assert.equal(quote.lines[0].gstPaise, 180); // 179.82 → 180
  assert.equal(quote.lines[1].gstPaise, 6); // 5.88 → 6
  assert.equal(quote.freightPaise, 250_000); // outstation
  assert.equal(quote.totalPaise, quote.subtotalPaise + quote.gstPaise + quote.freightPaise);
});

test('a quote never carries a guessed or repeated item', () => {
  const opts = { pincode: '560001', freight: FREIGHT, version: 1, validDays: 7, priceSource: 'test' };
  assert.throws(() => priceQuote([{ sku: 'NOPE', quantity: 1 }], [product('A', 1)], opts), /not in the catalogue/);
  assert.throws(() => priceQuote([{ sku: 'A', quantity: 1 }, { sku: 'A', quantity: 2 }], [product('A', 1)], opts), /twice/);
});

test('freight and pincode rules', () => {
  assert.equal(freightFor('560058', FREIGHT).paise, 120_000);
  assert.equal(freightFor('575001', FREIGHT).paise, 120_000);
  assert.equal(freightFor('600032', FREIGHT).paise, 250_000);
  assert.ok(isPincode('560058'));
  assert.ok(!isPincode('056005'));
  assert.ok(!isPincode('56005'));
});

test('the approval limit: above the limit needs an approver, at the limit does not', () => {
  assert.ok(needsApproval(5_000_001, 50_000));
  assert.ok(!needsApproval(5_000_000, 50_000));
});

test('availability: in stock, after incoming stock arrives, or short', () => {
  const stock = { ...product('A', 1), available: 1000, incomingLocal: 500, incomingImport: 2000, incomingLocalEta: '2026-10-05', incomingImportEta: '2026-10-20' };
  assert.equal(availabilityFor(800, stock).status, 'in_stock');
  const local = availabilityFor(1400, stock);
  assert.equal(local.status, 'after_incoming');
  assert.equal(local.eta, '2026-10-05');
  assert.equal(availabilityFor(3000, stock).eta, '2026-10-20');
  const short = availabilityFor(4000, stock);
  assert.equal(short.status, 'short');
  assert.equal(short.shortBy, 500);
  // Free stock below zero (over-committed) counts as none.
  assert.equal(availabilityFor(10, { ...stock, available: -50, incomingLocal: 0, incomingImport: 0 }).free, 0);
});

test('the delivery phrase the buyer reads', () => {
  const base = { sku: 'A', name: 'A', unit: 'pcs', hsn: null, quantity: 10, ratePaise: 1, amountPaise: 10, gstRateBp: 0, gstPaise: 0 };
  assert.equal(deliveryPhrase({ ...base, availability: { status: 'in_stock', free: 20, incoming: 0, eta: null, shortBy: 0 } }), 'in stock');
  assert.equal(deliveryPhrase({ ...base, availability: { status: 'after_incoming', free: 5, incoming: 10, eta: '2026-10-05', shortBy: 0 } }), 'ships after 5 Oct');
  assert.equal(deliveryPhrase({ ...base, availability: { status: 'short', free: 4, incoming: 0, eta: null, shortBy: 6 } }), '4 pcs now, balance date to be confirmed');
});
