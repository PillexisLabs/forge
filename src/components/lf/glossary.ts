// Plain definitions for the terms Forge shows in column headings and cards.
// One place, so a term always means the same thing on every screen.
export const GLOSSARY = {
  rate: 'The price per unit before GST, from the catalogue.',
  gst: 'Goods and Services Tax charged on this item. Forge adds it to the quote and invoice.',
  onHand: 'Stock physically in your warehouse now.',
  committed: 'Stock promised to confirmed orders that are not dispatched yet.',
  free: 'On hand minus committed: what you can promise to a new order today. Below zero means orders already need more than you have.',
  incomingLocal: 'Stock ordered from local suppliers and on the way, with the arrival date when you set it.',
  incomingImport: 'Imported stock on the way, with the arrival date when you set it.',
  freeAfterIncoming: 'Free stock after all incoming stock arrives. Below zero means you must order more to cover confirmed orders.',
  sku: 'Stock keeping unit: the short code for one catalogue item.',
  sales: 'Total value of orders confirmed in this period, with GST and freight.',
  collected: 'Payments recorded against orders in this period.',
  pendingPayment: 'Money still owed on open orders today, including amounts not due yet.',
  openQuotes: 'Quotes that are not accepted or lost yet, and their total value.',
  wonOfDecided: 'Of the quotes that ended accepted or lost, the share that were accepted.',
  next: 'What happens next on this quote, and who must act.',
  payment: 'Payment status for the order: due, overdue or paid, from the payment terms.',
  result: 'What Forge did with the message: made a new enquiry, added it to a record, sent it, or could not handle it.',
  expected: 'The date the supplier should deliver, from the supplier lead time.',
  approvalLimit: 'Quotes above this total, with GST and freight, need an approver before Forge sends them.',
} as const;

export type GlossaryTerm = keyof typeof GLOSSARY;
