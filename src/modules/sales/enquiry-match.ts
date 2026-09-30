import type { Product } from '@/core/products';

// Reads a buyer's message and finds the catalogue items, quantities and the
// delivery pincode. These are fixed rules, not a model: every match lists
// the words it matched on, and anything it cannot match goes to a person.
// An AI employee later replaces this function with a model call that
// returns the same result shape, behind the same review step.

export type MatchedLine = { sku: string; quantity: number; matchedOn: string[]; text: string };

/** Why part of a message did not become a quote line. */
export type UnmatchedReason = 'not_in_catalogue' | 'ambiguous' | 'no_quantity';

export type EnquiryMatch = {
  lines: MatchedLine[];
  pincode: string | null;
  /** Parts of the message that look like a request but match no single item. */
  unmatched: string[];
  /** The reason for each unmatched part, keyed by its text. */
  reasons?: Record<string, UnmatchedReason>;
};

const UNIT_TOKENS: Record<string, string> = { kg: 'kg', kgs: 'kg', g: 'g', gm: 'g', l: 'l', ltr: 'l', litre: 'l', liter: 'l', ml: 'ml', mm: 'mm' };

/** "2 kg of laminated roll" for an item sold by kg: the size is the quantity. */
function unitQuantity(segment: string, product: Product): number | null {
  const unit = UNIT_TOKENS[product.unit.toLowerCase()];
  if (!unit) return null;
  const nameTokens = new Set(tokens(product.name));
  for (const token of tokens(segment)) {
    const m = token.match(/^(\d+)([a-z]+)$/);
    if (m && m[2] === unit && !nameTokens.has(token)) return Number(m[1]);
  }
  return null;
}

// A size and its unit ("250 ml", "12 micron"). Keep this a regex literal: the
// production minifier turned the earlier template-string RegExp's "\b" into a
// backspace character, so sizes never joined and nothing matched on a server.
const SIZE_UNIT = /(\d+(?:\.\d+)?)\s*(ml|ltr|litre|liter|l|kg|kgs|g|gm|gram|grams|micron|microns|mm|colou?r|colou?rs|layer|layers)\b/g;
const QTY_UNITS = /^(?:pcs|pc|pieces|piece|nos|no|units|bags|rolls|pouches|boxes)\b/;
const STOP = new Set(['need', 'want', 'wants', 'please', 'send', 'rate', 'rates', 'price', 'quote', 'the', 'for', 'of', 'a', 'an', 'hi', 'hello', 'sir', 'madam', 'required', 'requirement', 'about', 'with', 'print', 'printed', 'same', 'as', 'last', 'time', 'our', 'new', 'line', 'your', 'best', 'what', 'is', 'are', 'to', 'and', 'in', 'on', 'we', 'i', 'me', 'my', 'pcs', 'pieces', 'nos']);
const NUMBER_WORDS: Record<string, string> = { one: '1', two: '2', three: '3', four: '4', five: '5', six: '6' };

function stem(word: string): string {
  if (word.length > 4 && word.endsWith('es') && /(ch|sh|x|ss)es$/.test(word)) return word.slice(0, -2);
  if (word.length > 3 && word.endsWith('s') && !word.endsWith('ss')) return word.slice(0, -1);
  return word;
}

/** Lowercase, join sizes to their units ("250 ml" → "250ml"), and join hyphenated words. */
export function normalize(text: string): string {
  let t = ` ${text.toLowerCase()} `
    .replace(/[–—]/g, '-')
    .replace(/(\w)-(\w)/g, '$1$2')                   // stand-up → standup
    .replace(/\b(one|two|three|four|five|six)\s+(colou?rs?)\b/g, (_, n, u) => `${NUMBER_WORDS[n]} ${u}`)
    .replace(/(\d),(?=\d{2,3}\b)/g, '$1')             // 5,000 / 1,00,000 → digits
    .replace(/(\d),(?=\d{2,3}\b)/g, '$1');
  t = t.replace(SIZE_UNIT, (_, n, u) => {
    const unit = u.startsWith('colo') ? 'colour' : u.startsWith('micron') ? 'micron' : ['ltr', 'litre', 'liter'].includes(u) ? 'l' : ['kgs'].includes(u) ? 'kg' : ['gm', 'gram', 'grams'].includes(u) ? 'g' : u.startsWith('layer') ? 'layer' : u;
    return ` ${n}${unit} `;
  });
  return t.replace(/\s+/g, ' ').trim();
}

function tokens(text: string): string[] {
  return normalize(text).split(/[^a-z0-9.]+/).map((w) => w.replace(/^\.+|\.+$/g, '')).filter(Boolean).map(stem);
}

/** A quantity: "5000", "5k", "2 lakh", "1.5 lakh". Sizes like "250ml" are not quantities. */
function quantities(segment: string): number[] {
  const found: number[] = [];
  const re = /(?<![\w.])(\d+(?:\.\d+)?)(\s*(?:k|thousand|lakh|lakhs|lac))?(?!\w|\.\d)/g;
  const text = normalize(segment);
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    let n = Number(m[1]);
    const mult = (m[2] ?? '').trim();
    if (mult === 'k' || mult === 'thousand') n *= 1000;
    if (mult.startsWith('la')) n *= 100000;
    if (!Number.isFinite(n) || n <= 0 || !Number.isInteger(n)) continue;
    const after = text.slice(re.lastIndex).trimStart();
    // A 6-digit number without a quantity unit after it is read as a pincode, not a quantity.
    if (/^[1-9]\d{5}$/.test(m[1]) && !mult && !QTY_UNITS.test(after)) continue;
    found.push(n);
  }
  return found;
}

export function findPincode(text: string): string | null {
  const t = normalize(text);
  const re = /(?<!\d)([1-9]\d{5})(?!\d)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(t))) {
    const after = t.slice(re.lastIndex).trimStart();
    if (!QTY_UNITS.test(after)) return m[1];
  }
  return null;
}

type ProductIndex = { product: Product; words: Set<string>; distinctive: Set<string> };

function indexProducts(products: Product[]): ProductIndex[] {
  const lists = products.map((product) => ({
    product,
    words: new Set(tokens(`${product.name} ${product.sku.replace(/-/g, ' ')}`).filter((w) => !STOP.has(w) && !/^\d+$/.test(w))),
  }));
  const counts = new Map<string, number>();
  for (const item of lists) for (const w of item.words) counts.set(w, (counts.get(w) ?? 0) + 1);
  return lists.map((item) => ({ ...item, distinctive: new Set([...item.words].filter((w) => counts.get(w) === 1)) }));
}

function bestProduct(segment: string, index: ProductIndex[]): { product: Product; matchedOn: string[] } | 'ambiguous' | null {
  const words = new Set(tokens(segment));
  const scored = index.map((item) => {
    const hits = [...item.words].filter((w) => words.has(w));
    const distinctive = hits.filter((w) => item.distinctive.has(w));
    const score = hits.reduce((sum, w) => sum + (/\d/.test(w) ? 3 : 1) + (item.distinctive.has(w) ? 1 : 0), 0);
    return { item, hits, distinctive, score };
  }).filter((s) => s.distinctive.length > 0 && s.score >= 2).sort((a, b) => b.score - a.score);
  if (!scored.length) return null;
  if (scored.length > 1 && scored[0].score === scored[1].score) return 'ambiguous';
  return { product: scored[0].item.product, matchedOn: scored[0].hits };
}

export function matchEnquiry(text: string, products: Product[]): EnquiryMatch {
  const index = indexProducts(products);
  const segments = text
    // A comma starts a new item only when a new quantity and a word follow it:
    // "20 zipper pouch, 30 spout pouch" splits; "250 ml, 2 colour" and "5,000" do not.
    .split(/\band\b|&|\+|;|\n|\balso\b|,\s+(?=\d+(?:\.\d+)?\s*(?!(?:ml|ltr|litre|liter|l|kg|kgs|g|gm|gram|grams|micron|microns|mm|colou?rs?|layers?|pcs|pc|pieces|nos)\b)[a-z])/i)
    .map((s) => s.trim())
    .filter(Boolean);

  const lines: MatchedLine[] = [];
  const unmatched: string[] = [];
  const reasons: Record<string, UnmatchedReason> = {};
  const skip = (text: string, why: UnmatchedReason) => { unmatched.push(text); reasons[text] = why; };
  const pending: { product: Product; matchedOn: string[]; text: string }[] = [];

  for (const segment of segments) {
    const found = bestProduct(segment, index);
    const qty = quantities(segment);
    if (found === 'ambiguous') {
      skip(segment, 'ambiguous');
      continue;
    }
    if (!found) {
      if (qty.length) skip(segment, 'not_in_catalogue');
      continue;
    }
    if (!qty.length) {
      const inUnit = unitQuantity(segment, found.product);
      if (inUnit) qty.push(inUnit);
    }
    if (qty.length) {
      const existing = lines.find((line) => line.sku === found.product.sku);
      if (existing) existing.quantity += Math.max(...qty);
      else lines.push({ sku: found.product.sku, quantity: Math.max(...qty), matchedOn: found.matchedOn, text: segment });
    } else {
      pending.push({ ...found, text: segment });
    }
  }

  // "Need stand-up pouches 250 ml. Quantity 5000." — one item, one quantity elsewhere.
  if (pending.length === 1 && lines.length === 0) {
    const all = quantities(text);
    if (all.length === 1) lines.push({ sku: pending[0].product.sku, quantity: all[0], matchedOn: pending[0].matchedOn, text: pending[0].text });
    else skip(pending[0].text, 'no_quantity');
  } else {
    for (const item of pending) skip(item.text, 'no_quantity');
  }

  return { lines, pincode: findPincode(text), unmatched, reasons };
}

/**
 * Match a whole conversation: every buyer message on the case, oldest first.
 * The messages are read together, so an item in one message and its
 * quantity in the next still match. When a later message names an item with
 * its own quantity, the buyer restated or corrected it: that quantity wins,
 * never the sum of both messages. The latest pincode wins too.
 */
export function matchConversation(messages: string[], products: Product[]): EnquiryMatch {
  const combined = matchEnquiry(messages.join('\n'), products);
  const latest = new Map<string, MatchedLine>();
  let pincode: string | null = null;
  for (const message of messages) {
    for (const line of matchEnquiry(message, products).lines) latest.set(line.sku, line);
    pincode = findPincode(message) ?? pincode;
  }
  const lines = combined.lines.map((line) => {
    const restated = latest.get(line.sku);
    return restated ? { ...line, quantity: restated.quantity, text: restated.text } : line;
  });
  return { lines, pincode: pincode ?? combined.pincode, unmatched: combined.unmatched, reasons: combined.reasons };
}

/** A buyer's reply that confirms the order. A negative word anywhere wins. */
export function isConfirmation(text: string): boolean {
  const t = ` ${text.toLowerCase().replace(/[^a-z\s']/g, ' ')} `;
  if (/\b(not|don't|dont|no|cancel|wait|hold|later|reduce|discount|change|revise)\b/.test(t)) return false;
  return /\b(confirm|confirmed|go ahead|proceed|place the order|place order|book it|book the order|approved|done deal|order it|yes please|ok go|okay go)\b/.test(t);
}
