import { inputObject, optionalText, requiredText, StepError, type CaseRecord, type JobDefinition } from '@/core/jobs';
import { formatPaise } from '@/core/money';

// The order job: a confirmed order made from an accepted quote.
//
//   (quote.accepted) ──create──▶ confirmed ──dispatch──▶ dispatched
//                                    └────cancel────▶ cancelled
//
// A rule creates the order from the quote event, so the items and prices
// are never typed twice. The inventory module listens to the order events
// and keeps committed stock correct.

export type OrderLine = {
  sku: string;
  name: string;
  unit: string;
  quantity: number;
  ratePaise: number;
  amountPaise: number;
  gstPaise: number;
};

export type OrderSubject = { buyerName: string; company: string | null; phone: string | null };

export type OrderData = {
  quoteRef: string;
  quoteVersion: number;
  buyerPo: string | null;
  pincode: string;
  lines: OrderLine[];
  subtotalPaise: number;
  gstPaise: number;
  freightPaise: number;
  totalPaise: number;
  dispatch?: { note: string | null; vehicle: string | null; at: string };
  cancellation?: { reason: string; at: string };
  fixture?: boolean;
};

export type OrderCase = CaseRecord<OrderData, OrderSubject>;

function num(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new StepError(`The quote event has no valid ${label}.`);
  return value;
}

function linesOf(current: CaseRecord | null) {
  return ((current?.data as OrderData | undefined)?.lines ?? []).map((line) => ({ sku: line.sku, quantity: line.quantity }));
}

export const orderJob: JobDefinition = {
  job: 'order',
  module: 'orders',
  label: 'Order',
  refPrefix: 'SO',
  states: {
    confirmed: { label: 'Confirmed', assignee: 'operations' },
    dispatched: { label: 'Dispatched', assignee: null, terminal: true },
    cancelled: { label: 'Cancelled', assignee: null, terminal: true },
  },
  steps: {
    createFromQuote: {
      label: 'Create from accepted quote',
      from: [],
      to: ['confirmed'],
      permission: 'orders:write',
      actors: ['rule'],
      parse(raw) {
        const payload = inputObject(raw);
        const buyer = inputObject(payload.buyer);
        const lines = (Array.isArray(payload.lines) ? payload.lines : []).map((line): OrderLine => {
          const obj = inputObject(line);
          return {
            sku: requiredText(obj, 'sku', 'SKU', 64),
            name: requiredText(obj, 'name', 'Item name', 200),
            unit: requiredText(obj, 'unit', 'Unit', 20),
            quantity: num(obj.quantity, 'quantity'),
            ratePaise: num(obj.rate_paise, 'rate'),
            amountPaise: num(obj.amount_paise, 'amount'),
            gstPaise: num(obj.gst_paise, 'GST'),
          };
        });
        if (!lines.length) throw new StepError('The accepted quote has no items.');
        return {
          subject: {
            buyerName: requiredText(buyer, 'buyerName', 'Buyer name', 120),
            company: optionalText(buyer, 'company', 160),
            phone: optionalText(buyer, 'phone', 20),
          } satisfies OrderSubject,
          data: {
            quoteRef: requiredText(payload, 'quote_ref', 'Quote reference', 32),
            quoteVersion: num(payload.version, 'version'),
            buyerPo: optionalText(payload, 'buyer_po', 80),
            pincode: requiredText(payload, 'pincode', 'Pincode', 6),
            lines,
            subtotalPaise: num(payload.subtotal_paise, 'subtotal'),
            gstPaise: num(payload.gst_paise, 'GST'),
            freightPaise: num(payload.freight_paise, 'freight'),
            totalPaise: num(payload.total_paise, 'total'),
            fixture: payload.fixture === true,
          } satisfies OrderData,
        };
      },
      async run(_ctx, input) {
        return {
          title: input.subject.company ?? input.subject.buyerName,
          subject: input.subject,
          data: input.data,
          summary: `Created from quote ${input.data.quoteRef} v${input.data.quoteVersion}: ${input.data.lines.length} ${input.data.lines.length === 1 ? 'item' : 'items'}, ${formatPaise(input.data.totalPaise)}. Nobody typed the items again.`,
          events: (saved) => [{
            name: 'order.confirmed',
            dedupeKey: `case:${saved.id}`,
            payload: { v: 1, order_ref: saved.ref, quote_ref: input.data.quoteRef, lines: input.data.lines.map((l: OrderLine) => ({ sku: l.sku, quantity: l.quantity })) },
          }],
        };
      },
    },

    dispatchOrder: {
      label: 'Mark as dispatched',
      from: ['confirmed'],
      to: ['dispatched'],
      permission: 'orders:write',
      parse(raw) {
        const input = inputObject(raw);
        return { vehicle: optionalText(input, 'vehicle', 40), note: optionalText(input, 'note', 1000) };
      },
      async run({ current }, input) {
        return {
          data: { dispatch: { note: input.note, vehicle: input.vehicle, at: new Date().toISOString() } },
          summary: `Dispatched${input.vehicle ? ` on vehicle ${input.vehicle}` : ''}. Stock on hand goes down by the order quantities.`,
          events: (saved) => [{
            name: 'order.dispatched',
            dedupeKey: `case:${saved.id}`,
            payload: { v: 1, order_ref: saved.ref, lines: linesOf(current) },
          }],
        };
      },
    },

    cancelOrder: {
      label: 'Cancel order',
      from: ['confirmed'],
      to: ['cancelled'],
      permission: 'orders:write',
      parse(raw) {
        return { reason: requiredText(inputObject(raw), 'reason', 'The reason', 1000) };
      },
      async run(_ctx, input) {
        return {
          data: { cancellation: { reason: input.reason, at: new Date().toISOString() } },
          summary: `Cancelled: ${input.reason}. The committed stock is released.`,
          events: (saved) => [{
            name: 'order.cancelled',
            dedupeKey: `case:${saved.id}`,
            payload: { v: 1, order_ref: saved.ref },
          }],
        };
      },
    },
  },
};
