import { formatPaise, percentOf, rupeesToPaise } from '@/core/money';
import type { Product } from '@/core/products';

// The quote's fixed rules. Pure functions, so they are exact and testable,
// and so a future AI employee can never change how a price is calculated:
// it can only choose the items and quantities, as a person does today.

export type QuoteLineInput = { sku: string; quantity: number };

/** Stock for one line when the quote was drafted. */
export type LineAvailability = {
  status: 'in_stock' | 'after_incoming' | 'short';
  /** Free stock now (on hand minus committed), never below zero. */
  free: number;
  /** Stock on the way. */
  incoming: number;
  /** When the incoming stock that covers this line arrives, if known. */
  eta: string | null;
  /** Quantity that other orders already hold beyond the stock on hand. */
  backlog?: number;
  /** Quantity no stock or incoming stock covers. */
  shortBy: number;
};

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
  availability?: LineAvailability;
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

/** Can the stock cover this quantity now, after incoming stock arrives, or not at all? */
export function availabilityFor(quantity: number, product: Product): LineAvailability {
  // Free stock can be negative: orders may already hold more than is on hand.
  // Incoming stock covers that backlog first, so it is never promised twice.
  const net = product.available;
  const free = Math.max(0, net);
  const incoming = product.incomingLocal + product.incomingImport;
  if (quantity <= free) return { status: 'in_stock', free, incoming, eta: null, shortBy: 0, backlog: Math.max(0, -net) };
  const afterLocal = net + product.incomingLocal;
  if (product.incomingLocal > 0 && quantity <= afterLocal) {
    return { status: 'after_incoming', free, incoming, eta: product.incomingLocalEta, shortBy: 0, backlog: Math.max(0, -net) };
  }
  const afterAll = afterLocal + product.incomingImport;
  if (product.incomingImport > 0 && quantity <= afterAll) {
    const etas = [product.incomingLocal > 0 ? product.incomingLocalEta : null, product.incomingImportEta].filter(Boolean) as string[];
    return { status: 'after_incoming', free, incoming, eta: etas.sort().at(-1) ?? null, shortBy: 0, backlog: Math.max(0, -net) };
  }
  return { status: 'short', free, incoming, eta: null, shortBy: quantity - Math.max(0, afterAll), backlog: Math.max(0, -net) };
}

export function formatEta(eta: string | null): string {
  if (!eta) return 'the next arrival';
  return new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' }).format(new Date(`${eta}T00:00:00+05:30`));
}

/** One short phrase for the buyer about when a line ships. */
export function deliveryPhrase(line: QuoteLine): string {
  const a = line.availability;
  if (!a || a.status === 'in_stock') return 'in stock';
  if (a.status === 'after_incoming') return `ships after ${formatEta(a.eta)}`;
  return a.free > 0 ? `${a.free.toLocaleString('en-IN')} ${line.unit} now, balance date to be confirmed` : 'date to be confirmed';
}

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
      availability: availabilityFor(line.quantity, product),
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
    .map((line) => `• ${line.name}: ${line.quantity.toLocaleString('en-IN')} ${line.unit} × ${formatPaise(line.ratePaise)}, ${deliveryPhrase(line)}`)
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
