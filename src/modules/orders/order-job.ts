import { inputObject, optionalText, requiredText, StepError, type CaseRecord, type JobDefinition } from '@/core/jobs';
import { formatPaise, rupeesToPaise } from '@/core/money';
import { getPaymentRules } from './payment-settings';

// The order job: a confirmed order made from an accepted quote, through
// dispatch to payment.
//
//   (quote.accepted) ──create──▶ confirmed ──dispatch──▶ dispatched ──payment──▶ paid
//                                  │  └── payment (advance) ──┘                  ▲
//                                  └──cancel──▶ cancelled        paid in full ───┘
//
// At dispatch the due date follows the payment terms in Settings. The
// reminder rule sends payment reminders on the buyer's channel until the
// balance is paid.
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

export type OrderSubject = { buyerName: string; company: string | null; phone: string | null; email?: string | null };

export type Payment = { amountPaise: number; mode: string; reference: string | null; at: string; by: string };

export type PaymentState = {
  termsDays: number;
  /** Set at dispatch. */
  dueAt: string | null;
  paidPaise: number;
  payments: Payment[];
  /** Reminder keys already handled (sent, or handed to a person). */
  reminders: { key: string; at: string; channel: string | null; sent: boolean }[];
};

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
  payment?: PaymentState;
  /** A buyer message or a reminder that a person must handle. */
  attention?: { reason: string; at: string } | null;
  fixture?: boolean;
};

export type OrderCase = CaseRecord<OrderData, OrderSubject>;

function num(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new StepError(`The quote event has no valid ${label}.`);
  return value;
}

export const PAYMENT_MODES = ['UPI', 'NEFT', 'RTGS', 'IMPS', 'Cheque', 'Cash', 'Other'] as const;

export function balanceOf(data: OrderData): number {
  return Math.max(0, data.totalPaise - (data.payment?.paidPaise ?? 0));
}

function emptyPayment(termsDays: number): PaymentState {
  return { termsDays, dueAt: null, paidPaise: 0, payments: [], reminders: [] };
}

function paidEvent(saved: CaseRecord) {
  return [{ name: 'order.paid' as const, dedupeKey: `case:${saved.id}`, payload: { v: 1, order_ref: saved.ref, order_case_id: saved.id } }];
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
    // Nobody needs to act while payment is not yet overdue; reminders run on their own.
    dispatched: { label: 'Dispatched, payment due', assignee: null },
    paid: { label: 'Paid', assignee: null, terminal: true },
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
            email: optionalText(buyer, 'email', 160),
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
      to: ['dispatched', 'paid'],
      permission: 'orders:write',
      parse(raw) {
        const input = inputObject(raw);
        return { vehicle: optionalText(input, 'vehicle', 40), note: optionalText(input, 'note', 1000) };
      },
      async run({ current }, input) {
        const data = current!.data as OrderData;
        const rules = await getPaymentRules();
        const at = new Date();
        const dueAt = new Date(at.getTime() + rules.termsDays * 86400000);
        const payment = { ...(data.payment ?? emptyPayment(rules.termsDays)), termsDays: rules.termsDays, dueAt: dueAt.toISOString() };
        const paidInFull = balanceOf({ ...data, payment }) === 0;
        const due = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' }).format(dueAt);
        return {
          to: paidInFull ? 'paid' : 'dispatched',
          data: { dispatch: { note: input.note, vehicle: input.vehicle, at: at.toISOString() }, payment },
          summary: `Dispatched${input.vehicle ? ` on vehicle ${input.vehicle}` : ''}. `
            + (paidInFull ? 'It was paid in advance, so the order is closed.' : `Payment of ${formatPaise(balanceOf({ ...data, payment }))} is due on ${due}.`),
          events: (saved) => [
            { name: 'order.dispatched', dedupeKey: `case:${saved.id}`, payload: { v: 1, order_ref: saved.ref, lines: linesOf(current) } },
            ...(paidInFull ? paidEvent(saved) : []),
          ],
        };
      },
    },

    recordPayment: {
      label: 'Record payment',
      from: ['confirmed', 'dispatched'],
      to: ['confirmed', 'dispatched', 'paid'],
      permission: 'orders:write',
      parse(raw) {
        const input = inputObject(raw);
        const amount = Number(String(input.amount ?? '').replace(/[₹,\s]/g, ''));
        if (!Number.isFinite(amount) || amount <= 0) throw new StepError('Enter the amount received in rupees.');
        const mode = String(input.mode ?? '');
        if (!(PAYMENT_MODES as readonly string[]).includes(mode)) throw new StepError('Choose how the buyer paid.');
        return { amountPaise: rupeesToPaise(amount), mode, reference: optionalText(input, 'reference', 80) };
      },
      async run({ current, actor }, input) {
        const data = current!.data as OrderData;
        const payment = data.payment ?? emptyPayment((await getPaymentRules()).termsDays);
        const balance = balanceOf(data);
        if (input.amountPaise > balance) {
          throw new StepError(`The balance is ${formatPaise(balance)}. Enter that amount or less.`);
        }
        const next: PaymentState = {
          ...payment,
          paidPaise: payment.paidPaise + input.amountPaise,
          payments: [...payment.payments, { amountPaise: input.amountPaise, mode: input.mode, reference: input.reference, at: new Date().toISOString(), by: actor.name }],
        };
        const left = Math.max(0, data.totalPaise - next.paidPaise);
        const to = current!.state === 'dispatched' && left === 0 ? 'paid' : current!.state;
        return {
          to,
          data: { payment: next, attention: null },
          summary: `Recorded ${formatPaise(input.amountPaise)} by ${input.mode}${input.reference ? ` (${input.reference})` : ''}. `
            + (left === 0 ? (to === 'paid' ? 'Paid in full; the order is closed.' : 'Paid in full in advance.') : `Balance ${formatPaise(left)}.`),
          events: to === 'paid' ? paidEvent : undefined,
        };
      },
    },

    sendReminder: {
      label: 'Send payment reminder',
      from: ['dispatched'],
      to: ['dispatched'],
      permission: 'orders:write',
      actors: ['rule'],
      parse(raw) {
        const input = inputObject(raw);
        return {
          key: requiredText(input, 'key', 'Reminder key', 20),
          sent: input.sent === true,
          channel: optionalText(input, 'channel', 20),
          text: requiredText(input, 'text', 'Reminder text', 1000),
        };
      },
      async run({ current }, input) {
        const data = current!.data as OrderData;
        const payment = data.payment ?? emptyPayment(30);
        return {
          data: {
            payment: { ...payment, reminders: [...payment.reminders, { key: input.key, at: new Date().toISOString(), channel: input.channel, sent: input.sent }] },
            ...(input.sent ? {} : { attention: { reason: `Send the payment reminder yourself: Forge cannot message this buyer now. “${input.text.slice(0, 120)}…”`, at: new Date().toISOString() } }),
          },
          summary: input.sent
            ? `Sent a payment reminder on ${input.channel === 'email' ? 'email' : 'WhatsApp'} for ${formatPaise(balanceOf(data))}.`
            : `A payment reminder for ${formatPaise(balanceOf(data))} was due, but Forge cannot message the buyer now. A person must send it.`,
        };
      },
    },

    addMessage: {
      label: 'Add buyer message',
      from: ['confirmed', 'dispatched'],
      to: ['confirmed', 'dispatched'],
      permission: 'orders:write',
      actors: ['rule', 'user'],
      parse(raw) {
        const input = inputObject(raw);
        return { text: requiredText(input, 'text', 'The message', 4000), via: optionalText(input, 'via', 20) ?? 'message' };
      },
      async run({ current }, input) {
        return {
          to: current!.state,
          data: { attention: { reason: `The buyer wrote: “${input.text.replace(/\s+/g, ' ').slice(0, 140)}${input.text.length > 140 ? '…' : ''}”`, at: new Date().toISOString() } },
          summary: `The buyer wrote on ${input.via === 'email' ? 'email' : 'WhatsApp'}: "${input.text.slice(0, 160)}". A person must answer it.`,
        };
      },
    },

    markHandled: {
      label: 'Mark as handled',
      from: ['confirmed', 'dispatched'],
      to: ['confirmed', 'dispatched'],
      permission: 'orders:write',
      parse: () => ({}),
      async run({ current }) {
        return { to: current!.state, data: { attention: null }, summary: 'Handled the buyer’s message.' };
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

/** The payment position of an order, for lists and the dashboard. */
export function paymentStatus(data: OrderData, state: string, now = new Date()): {
  key: 'none' | 'advance' | 'due' | 'overdue' | 'paid';
  label: string;
  balancePaise: number;
  daysOverdue: number;
} {
  const balancePaise = balanceOf(data);
  if (state === 'cancelled') return { key: 'none', label: 'Cancelled', balancePaise: 0, daysOverdue: 0 };
  if (balancePaise === 0) return { key: 'paid', label: 'Paid', balancePaise, daysOverdue: 0 };
  const dueAt = data.payment?.dueAt ? new Date(data.payment.dueAt) : null;
  if (!dueAt) {
    return (data.payment?.paidPaise ?? 0) > 0
      ? { key: 'advance', label: `Advance ${formatPaise(data.payment!.paidPaise)} received`, balancePaise, daysOverdue: 0 }
      : { key: 'none', label: 'Due after dispatch', balancePaise, daysOverdue: 0 };
  }
  const days = Math.floor((now.getTime() - dueAt.getTime()) / 86400000);
  const date = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' }).format(dueAt);
  if (days > 0) return { key: 'overdue', label: `Overdue by ${days} ${days === 1 ? 'day' : 'days'}`, balancePaise, daysOverdue: days };
  return { key: 'due', label: `Due ${date}`, balancePaise, daysOverdue: 0 };
}
