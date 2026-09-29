import { findCustomer } from '@/core/customers';
import { inputObject, optionalText, requiredText, StepError, type CaseRecord, type JobDefinition } from '@/core/jobs';
import { formatPaise, rupeesToPaise } from '@/core/money';
import { allocate, getPaymentRules, instalmentsFor, startDueDates, termsFor, type Instalment, type Terms } from './payment-settings';

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
  /** The terms the order started with (a customer's own, or the default). */
  terms?: Terms & { source: string };
  instalments?: Instalment[];
  /** Orders from before instalments: one due date, set at dispatch. */
  termsDays?: number;
  dueAt?: string | null;
  paidPaise: number;
  payments: Payment[];
  /** Reminder keys already handled (sent, or handed to a person). */
  reminders: { key: string; at: string; channel: string | null; sent: boolean }[];
};

export type OrderDocument = {
  kind: 'order_confirmation' | 'payment_request' | 'tax_invoice';
  number: string;
  instalment: string | null;
  at: string;
  sent: boolean;
  channel: string | null;
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
  documents?: OrderDocument[];
  /** For a tax invoice: the buyer's GSTIN and state code, when known. */
  buyerGstin?: string | null;
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

/** The instalments of an order, also for orders saved before instalments. */
export function instalmentsOf(data: OrderData): Instalment[] {
  const p = data.payment;
  const base: Instalment[] = p?.instalments?.length
    ? p.instalments
    : [{ key: 'balance', label: 'Payment', amountPaise: data.totalPaise, trigger: 'dispatch', days: p?.termsDays ?? 30, dueAt: p?.dueAt ?? null, paidPaise: 0 }];
  return allocate(base, p?.paidPaise ?? 0);
}

async function newPayment(totalPaise: number, subject: OrderSubject, at: Date): Promise<PaymentState> {
  const rules = await getPaymentRules();
  const terms = termsFor(rules, subject);
  return { terms, instalments: instalmentsFor(totalPaise, terms, at), paidPaise: 0, payments: [], reminders: [] };
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
  customerOf(c) {
    const subject = c.subject as OrderSubject;
    const data = c.data as OrderData;
    if (!subject.buyerName) return null;
    return { name: subject.buyerName, company: subject.company ?? null, phone: subject.phone ?? null, email: subject.email ?? null, gstin: data.buyerGstin ?? null, pincode: data.pincode ?? null };
  },
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
        const payment = await newPayment(input.data.totalPaise, input.subject, new Date());
        // A GSTIN already on file for this buyer goes on the order and its invoices.
        const known = await findCustomer({ phone: input.subject.phone, email: input.subject.email });
        return {
          title: input.subject.company ?? input.subject.buyerName,
          subject: input.subject,
          data: { ...input.data, payment, ...(known?.gstin ? { buyerGstin: known.gstin } : {}) },
          summary: `Created from quote ${input.data.quoteRef} v${input.data.quoteVersion}: ${input.data.lines.length} ${input.data.lines.length === 1 ? 'item' : 'items'}, ${formatPaise(input.data.totalPaise)}. Nobody typed the items again.`,
          events: (saved) => [{
            name: 'order.confirmed',
            dedupeKey: `case:${saved.id}`,
            payload: { v: 1, order_ref: saved.ref, quote_ref: input.data.quoteRef, lines: input.data.lines.map((l: OrderLine) => ({ sku: l.sku, quantity: l.quantity })), fixture: input.data.fixture === true },
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
        const at = new Date();
        const instalments = startDueDates(instalmentsOf(data), 'dispatch', at);
        const payment: PaymentState = { ...(data.payment ?? { paidPaise: 0, payments: [], reminders: [] }), instalments };
        const paidInFull = balanceOf({ ...data, payment }) === 0;
        const next = instalments.find((i) => i.paidPaise < i.amountPaise && i.dueAt);
        const due = next ? new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' }).format(new Date(next.dueAt!)) : null;
        return {
          to: paidInFull ? 'paid' : 'dispatched',
          data: { dispatch: { note: input.note, vehicle: input.vehicle, at: at.toISOString() }, payment },
          summary: `Dispatched${input.vehicle ? ` on vehicle ${input.vehicle}` : ''}. `
            + (paidInFull ? 'It was paid in advance, so the order is closed.' : `${formatPaise(balanceOf({ ...data, payment }))} is still to be paid${due ? `; next due on ${due}` : ''}.`),
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
        const payment: PaymentState = data.payment ?? { paidPaise: 0, payments: [], reminders: [] };
        const balance = balanceOf(data);
        if (input.amountPaise > balance) {
          throw new StepError(`The balance is ${formatPaise(balance)}. Enter that amount or less.`);
        }
        const paidPaise = payment.paidPaise + input.amountPaise;
        const next: PaymentState = {
          ...payment,
          instalments: allocate(instalmentsOf(data), paidPaise),
          paidPaise,
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
      from: ['confirmed', 'dispatched'],
      to: ['confirmed', 'dispatched'],
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
        const payment: PaymentState = data.payment ?? { paidPaise: 0, payments: [], reminders: [] };
        return {
          to: current!.state,
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

    sendDocument: {
      label: 'Send document',
      from: ['confirmed', 'dispatched', 'paid'],
      to: ['confirmed', 'dispatched', 'paid'],
      permission: 'orders:write',
      actors: ['rule', 'user'],
      parse(raw) {
        const input = inputObject(raw);
        const kind = String(input.kind ?? '');
        if (!['order_confirmation', 'payment_request', 'tax_invoice'].includes(kind)) throw new StepError('Unknown document.');
        return {
          kind: kind as OrderDocument['kind'],
          number: requiredText(input, 'number', 'Document number', 40),
          instalment: optionalText(input, 'instalment', 20),
          sent: input.sent === true,
          channel: optionalText(input, 'channel', 20),
        };
      },
      async run({ current }, input) {
        const data = current!.data as OrderData;
        const doc: OrderDocument = { ...input, at: new Date().toISOString() };
        const names: Record<OrderDocument['kind'], string> = { order_confirmation: 'order confirmation', payment_request: 'payment request', tax_invoice: 'tax invoice' };
        const name = names[input.kind as OrderDocument['kind']];
        return {
          to: current!.state,
          data: {
            documents: [...(data.documents ?? []), doc],
            ...(input.sent ? {} : { attention: { reason: `Send the ${name} ${input.number} yourself: Forge cannot message this buyer now.`, at: doc.at } }),
          },
          summary: input.sent
            ? `Sent the ${name} ${input.number} on ${input.channel === 'email' ? 'email' : 'WhatsApp'}.`
            : `Made the ${name} ${input.number}. Forge cannot message the buyer now, so a person must send it.`,
        };
      },
    },

    setBuyerGstin: {
      label: 'Set buyer GSTIN',
      from: ['confirmed', 'dispatched'],
      to: ['confirmed', 'dispatched'],
      permission: 'orders:write',
      parse(raw) {
        const gstin = String(inputObject(raw).gstin ?? '').trim().toUpperCase();
        if (gstin && !/^\d{2}[A-Z0-9]{13}$/.test(gstin)) throw new StepError('A GSTIN has 15 characters and starts with the 2-digit state code.');
        return { gstin: gstin || null };
      },
      async run({ current }, input) {
        return { to: current!.state, data: { buyerGstin: input.gstin }, summary: input.gstin ? `Set the buyer GSTIN to ${input.gstin}.` : 'Removed the buyer GSTIN.' };
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

    sendReply: {
      label: 'Reply to the buyer',
      from: ['confirmed', 'dispatched'],
      to: ['confirmed', 'dispatched'],
      permission: 'orders:write',
      parse(raw) {
        const input = inputObject(raw);
        return { text: requiredText(input, 'text', 'The reply', 4000), via: input.via === 'email' ? 'email' : 'whatsapp' };
      },
      async run({ current }, input) {
        return {
          to: current!.state,
          data: { attention: null },
          summary: `Replied on ${input.via === 'email' ? 'email' : 'WhatsApp'}: "${input.text.slice(0, 160)}${input.text.length > 160 ? '…' : ''}"`,
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
  /** The instalment the status is about. */
  instalment: Instalment | null;
} {
  const balancePaise = balanceOf(data);
  if (state === 'cancelled') return { key: 'none', label: 'Cancelled', balancePaise: 0, daysOverdue: 0, instalment: null };
  if (balancePaise === 0) return { key: 'paid', label: 'Paid', balancePaise, daysOverdue: 0, instalment: null };
  const open = instalmentsOf(data).filter((i) => i.paidPaise < i.amountPaise);
  const dated = open.filter((i) => i.dueAt).sort((a, b) => a.dueAt!.localeCompare(b.dueAt!));
  const next = dated[0] ?? open[0] ?? null;
  const name = next && next.key !== 'balance' ? next.label : next && instalmentsOf(data).length > 1 ? 'Balance' : 'Payment';
  if (!next?.dueAt) {
    return (data.payment?.paidPaise ?? 0) > 0
      ? { key: 'advance', label: `${formatPaise(data.payment!.paidPaise)} received, balance after dispatch`, balancePaise, daysOverdue: 0, instalment: next }
      : { key: 'none', label: 'Due after dispatch', balancePaise, daysOverdue: 0, instalment: next };
  }
  const dueAt = new Date(next.dueAt);
  const days = Math.floor((now.getTime() - dueAt.getTime()) / 86400000);
  const date = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' }).format(dueAt);
  if (days > 0) return { key: 'overdue', label: `${name} overdue by ${days} ${days === 1 ? 'day' : 'days'}`, balancePaise, daysOverdue: days, instalment: next };
  return { key: 'due', label: `${name} due ${date}`, balancePaise, daysOverdue: 0, instalment: next };
}
