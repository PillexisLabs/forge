import { formatPaise, percentOf, rupeesToPaise } from '@/core/money';
import type { Product } from '@/core/products';

// The quote's fixed rules. Pure functions, so they are exact and testable,
// and so a future AI employee can never change how a price is calculated:
// it can only choose the items and quantities, as a person does today.

export type QuoteLineInput = { sku: string; quantity: number };

export type QuoteLine = {
  sku: string;
  name: string;
  unit: string;
  hsn: string | null;
  quantity: number;
  ratePaise: number;
  amountPaise: number;
  gstRateBp: number;
  gstPaise: number;
};

export type PricedQuote = {
  version: number;
  lines: QuoteLine[];
  pincode: string;
  subtotalPaise: number;
  gstPaise: number;
  freightPaise: number;
  totalPaise: number;
  validDays: number;
  preparedAt: string;
  /** Where the rates came from, e.g. "Forge catalogue". */
  priceSource: string;
};

export type FreightRule = {
  localPinPrefixes: string[];
  localRupees: number;
  outstationRupees: number;
};

export function isPincode(value: string): boolean {
  return /^[1-9][0-9]{5}$/.test(value);
}

export function freightFor(pincode: string, rule: FreightRule): { paise: number; basis: string } {
  const local = rule.localPinPrefixes.some((prefix) => pincode.startsWith(prefix));
  return local
    ? { paise: rupeesToPaise(rule.localRupees), basis: 'local delivery, flat rate' }
    : { paise: rupeesToPaise(rule.outstationRupees), basis: 'outstation delivery, flat rate' };
}

/**
 * Price the requested lines against the products. Throws on an unknown SKU or
 * a repeated SKU, so a quote never carries a guessed item.
 */
export function priceQuote(
  requested: QuoteLineInput[],
  products: Product[],
  opts: { pincode: string; freight: FreightRule; version: number; validDays: number; priceSource: string; now?: Date },
): PricedQuote {
  const bySku = new Map(products.map((product) => [product.sku, product]));
  const seen = new Set<string>();

  const lines = requested.map((line): QuoteLine => {
    if (seen.has(line.sku)) throw new Error(`${line.sku} appears twice. Combine the quantities in one line.`);
    seen.add(line.sku);
    const product = bySku.get(line.sku);
    if (!product) throw new Error(`${line.sku} is not in the catalogue.`);
    const amountPaise = product.ratePaise * line.quantity;
    return {
      sku: product.sku,
      name: product.name,
      unit: product.unit,
      hsn: product.hsn,
      quantity: line.quantity,
      ratePaise: product.ratePaise,
      amountPaise,
      gstRateBp: product.gstRateBp,
      gstPaise: percentOf(amountPaise, product.gstRateBp),
    };
  });

  const subtotalPaise = lines.reduce((sum, line) => sum + line.amountPaise, 0);
  const gstPaise = lines.reduce((sum, line) => sum + line.gstPaise, 0);
  const freightPaise = freightFor(opts.pincode, opts.freight).paise;

  return {
    version: opts.version,
    lines,
    pincode: opts.pincode,
    subtotalPaise,
    gstPaise,
    freightPaise,
    totalPaise: subtotalPaise + gstPaise + freightPaise,
    validDays: opts.validDays,
    preparedAt: (opts.now ?? new Date()).toISOString(),
    priceSource: opts.priceSource,
  };
}

/** The approval policy: a quote above the limit waits for an approver. */
export function needsApproval(totalPaise: number, limitRupees: number): boolean {
  return totalPaise > rupeesToPaise(limitRupees);
}

/** The WhatsApp text staff send with the quote PDF. */
export function quoteMessage(opts: {
  buyerName: string;
  ref: string;
  quote: PricedQuote;
  businessName: string;
}): string {
  const items = opts.quote.lines
    .map((line) => `• ${line.name}: ${line.quantity.toLocaleString('en-IN')} ${line.unit} × ${formatPaise(line.ratePaise)}`)
    .join('\n');
  return [
    `Hello ${opts.buyerName},`,
    '',
    `Thank you for your enquiry. Here is quote ${opts.ref} from ${opts.businessName}:`,
    items,
    '',
    `Total with GST and freight: ${formatPaise(opts.quote.totalPaise)}`,
    `Valid for ${opts.quote.validDays} days. The PDF is attached.`,
    '',
    'Reply "confirm" to place the order.',
  ].join('\n');
}
