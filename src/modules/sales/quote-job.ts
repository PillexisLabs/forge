import { env } from '@/core/env';
import {
  inputObject,
  optionalText,
  positiveInteger,
  requiredText,
  StepError,
  type CaseRecord,
  type JobDefinition,
} from '@/core/jobs';
import { formatPaise } from '@/core/money';
import { productSource } from '@/core/products';
import { isPincode, needsApproval, priceQuote, type PricedQuote, type QuoteLineInput } from './quote-rules';

// The quote job: from a buyer's enquiry to a sent quote and the buyer's answer.
//
//   enquiry ──draft──▶ draft ──submit──▶ awaiting_approval ──approve──▶ approved
//                        ▲                  │ return                       │
//                        └──────────────────┘◀──────── redraft ────────────┤
//                                                                          ▼ send
//                                              lost ◀── mark lost ── sent ──accept──▶ accepted
//
// Every step is run by a person today. The steps take typed input, so an AI
// employee can later run "draft" and "send" with the same checks, while the
// approval stays with a person above the limit.

export const QUOTE_CHANNELS = ['whatsapp', 'email', 'phone', 'walk_in'] as const;
export type QuoteChannel = (typeof QUOTE_CHANNELS)[number];

export const CHANNEL_LABELS: Record<QuoteChannel, string> = {
  whatsapp: 'WhatsApp',
  email: 'Email',
  phone: 'Phone call',
  walk_in: 'Walk-in',
};

export type QuoteSubject = {
  buyerName: string;
  company: string | null;
  phone: string | null;
};

export type QuoteData = {
  enquiry: { channel: QuoteChannel; message: string };
  quote?: PricedQuote;
  approval?: { version: number; by: string; at: string; basis: 'approver' | 'within_limit' } | null;
  sent?: { channel: QuoteChannel; at: string; version: number };
  outcome?: { result: 'accepted' | 'lost'; note: string | null; buyerPo?: string | null; at: string };
  fixture?: boolean;
};

export type QuoteCase = CaseRecord<QuoteData, QuoteSubject>;

function channelOf(value: unknown): QuoteChannel {
  if (typeof value === 'string' && (QUOTE_CHANNELS as readonly string[]).includes(value)) return value as QuoteChannel;
  throw new StepError('Choose how the enquiry arrived.');
}

function quoteOf(current: CaseRecord | null): PricedQuote {
  const quote = (current?.data as QuoteData | undefined)?.quote;
  if (!quote) throw new StepError('The case has no quote draft yet.');
  return quote;
}

function freightRule() {
  return {
    localPinPrefixes: env.salesLocalPinPrefixes(),
    localRupees: env.salesFreightLocalRupees(),
    outstationRupees: env.salesFreightOutstationRupees(),
  };
}

export const quoteJob: JobDefinition = {
  job: 'quote',
  module: 'sales',
  label: 'Quote',
  refPrefix: 'Q',
  states: {
    enquiry: { label: 'New enquiry', assignee: 'sales' },
    draft: { label: 'Quote draft', assignee: 'sales' },
    awaiting_approval: { label: 'Waiting for approval', assignee: 'approver' },
    approved: { label: 'Ready to send', assignee: 'sales' },
    sent: { label: 'Sent, waiting for buyer', assignee: 'sales' },
    accepted: { label: 'Accepted', assignee: null, terminal: true },
    lost: { label: 'Lost', assignee: null, terminal: true },
  },
  steps: {
    recordEnquiry: {
      label: 'Record enquiry',
      from: [],
      to: ['enquiry'],
      permission: 'sales:write',
      // 'rule' lets a channel intake (WhatsApp inbound) record enquiries later.
      actors: ['user', 'rule'],
      parse(raw) {
        const input = inputObject(raw);
        return {
          buyerName: requiredText(input, 'buyerName', 'Buyer name', 120),
          company: optionalText(input, 'company', 160),
          phone: optionalText(input, 'phone', 20),
          channel: channelOf(input.channel),
          message: requiredText(input, 'message', 'The enquiry text', 4000),
        };
      },
      async run(_ctx, input) {
        return {
          title: input.company ?? input.buyerName,
          subject: { buyerName: input.buyerName, company: input.company, phone: input.phone },
          data: { enquiry: { channel: input.channel, message: input.message } },
          summary: `Recorded an enquiry from ${input.buyerName}. It came by ${CHANNEL_LABELS[input.channel as QuoteChannel].toLowerCase()}.`,
        };
      },
    },

    draftQuote: {
      label: 'Save quote draft',
      from: ['enquiry', 'draft', 'approved'],
      to: ['draft'],
      permission: 'sales:write',
      parse(raw) {
        const input = inputObject(raw);
        const lines = Array.isArray(input.lines) ? input.lines : [];
        if (!lines.length) throw new StepError('Add at least one item to the quote.');
        const parsed: QuoteLineInput[] = lines.map((line, index) => {
          const obj = inputObject(line);
          return {
            sku: requiredText(obj, 'sku', `Item ${index + 1}`, 64),
            quantity: positiveInteger(obj.quantity, `The quantity for item ${index + 1}`),
          };
        });
        const pincode = requiredText(input, 'pincode', 'The delivery pincode', 6);
        if (!isPincode(pincode)) throw new StepError('The delivery pincode must be 6 digits.');
        return { lines: parsed, pincode };
      },
      async run({ tx, current }, input) {
        const source = productSource();
        const products = await source.get(input.lines.map((line: QuoteLineInput) => line.sku), tx);
        const previous = (current?.data as QuoteData | undefined)?.quote;
        let quote: PricedQuote;
        try {
          quote = priceQuote(input.lines, products, {
            pincode: input.pincode,
            freight: freightRule(),
            version: (previous?.version ?? 0) + 1,
            validDays: env.salesQuoteValidDays(),
            priceSource: source.label,
          });
        } catch (error) {
          throw new StepError(error instanceof Error ? error.message : String(error));
        }
        const wasApproved = current?.state === 'approved';
        return {
          data: { quote, approval: null },
          summary: `Saved quote draft v${quote.version}: ${quote.lines.length} ${quote.lines.length === 1 ? 'item' : 'items'}, total ${formatPaise(quote.totalPaise)}.`
            + (wasApproved ? ' The earlier approval no longer applies.' : ''),
        };
      },
    },

    submitQuote: {
      label: 'Submit quote',
      from: ['draft'],
      to: ['awaiting_approval', 'approved'],
      permission: 'sales:write',
      parse: () => ({}),
      async run({ current, actor }) {
        const quote = quoteOf(current);
        const limit = env.salesApprovalLimitRupees();
        if (needsApproval(quote.totalPaise, limit)) {
          return {
            to: 'awaiting_approval',
            summary: `Submitted v${quote.version}. The total ${formatPaise(quote.totalPaise)} is above the ${formatPaise(limit * 100)} limit, so an approver must approve it.`,
          };
        }
        return {
          to: 'approved',
          data: { approval: { version: quote.version, by: actor.name, at: new Date().toISOString(), basis: 'within_limit' } },
          summary: `Submitted v${quote.version}. The total ${formatPaise(quote.totalPaise)} is within the ${formatPaise(limit * 100)} limit, so no approval is needed.`,
        };
      },
    },

    approveQuote: {
      label: 'Approve',
      from: ['awaiting_approval'],
      to: ['approved'],
      permission: 'sales:approve',
      approverOnly: true,
      parse(raw) {
        const input = inputObject(raw);
        return { version: positiveInteger(input.version, 'The quote version') };
      },
      async run({ current, actor }, input) {
        const quote = quoteOf(current);
        // An approval applies to one exact version. A newer draft needs a new approval.
        if (input.version !== quote.version) {
          throw new StepError(`You approved v${input.version}, but the current draft is v${quote.version}. Reload and check it.`, 409);
        }
        return {
          data: { approval: { version: quote.version, by: actor.name, at: new Date().toISOString(), basis: 'approver' } },
          summary: `Approved v${quote.version} for ${formatPaise(quote.totalPaise)}.`,
        };
      },
    },

    returnQuote: {
      label: 'Return for changes',
      from: ['awaiting_approval'],
      to: ['draft'],
      permission: 'sales:approve',
      approverOnly: true,
      parse(raw) {
        return { note: requiredText(inputObject(raw), 'note', 'The reason', 1000) };
      },
      async run(_ctx, input) {
        return { summary: `Returned for changes: ${input.note}` };
      },
    },

    markSent: {
      label: 'Mark as sent',
      from: ['approved'],
      to: ['sent'],
      permission: 'sales:write',
      parse(raw) {
        return { channel: channelOf(inputObject(raw).channel) };
      },
      async run({ current }, input) {
        const data = current?.data as QuoteData;
        const quote = quoteOf(current);
        if (!data.approval || data.approval.version !== quote.version) {
          throw new StepError('This version is not approved. Submit it first.', 409);
        }
        return {
          data: { sent: { channel: input.channel, at: new Date().toISOString(), version: quote.version } },
          summary: `Sent v${quote.version} to the buyer by ${CHANNEL_LABELS[input.channel as QuoteChannel]}.`,
          events: (saved) => [{
            name: 'quote.sent',
            dedupeKey: `case:${saved.id}:v${quote.version}`,
            payload: { v: 1, quote_case_id: saved.id, quote_ref: saved.ref, version: quote.version, total_paise: quote.totalPaise, channel: input.channel },
          }],
        };
      },
    },

    markAccepted: {
      label: 'Buyer accepted',
      from: ['sent'],
      to: ['accepted'],
      permission: 'sales:write',
      parse(raw) {
        const input = inputObject(raw);
        return { buyerPo: optionalText(input, 'buyerPo', 80), note: optionalText(input, 'note', 1000) };
      },
      async run({ current }, input) {
        const quote = quoteOf(current);
        const subject = current?.subject as QuoteSubject;
        return {
          data: { outcome: { result: 'accepted', note: input.note, buyerPo: input.buyerPo, at: new Date().toISOString() } },
          summary: `The buyer accepted v${quote.version}${input.buyerPo ? ` with PO ${input.buyerPo}` : ''}.`,
          // The orders module turns this event into a confirmed order, so
          // nobody types the items and prices again.
          events: (saved) => [{
            name: 'quote.accepted',
            dedupeKey: `case:${saved.id}`,
            payload: {
              v: 1,
              quote_case_id: saved.id,
              quote_ref: saved.ref,
              version: quote.version,
              buyer: subject,
              buyer_po: input.buyerPo,
              pincode: quote.pincode,
              lines: quote.lines.map((line) => ({
                sku: line.sku, name: line.name, unit: line.unit, quantity: line.quantity,
                rate_paise: line.ratePaise, amount_paise: line.amountPaise, gst_paise: line.gstPaise,
              })),
              subtotal_paise: quote.subtotalPaise,
              gst_paise: quote.gstPaise,
              freight_paise: quote.freightPaise,
              total_paise: quote.totalPaise,
              fixture: (current?.data as QuoteData).fixture === true,
            },
          }],
        };
      },
    },

    markLost: {
      label: 'Mark as lost',
      from: ['enquiry', 'draft', 'awaiting_approval', 'approved', 'sent'],
      to: ['lost'],
      permission: 'sales:write',
      parse(raw) {
        return { reason: requiredText(inputObject(raw), 'reason', 'The reason', 1000) };
      },
      async run(_ctx, input) {
        return {
          data: { outcome: { result: 'lost', note: input.reason, at: new Date().toISOString() } },
          summary: `Marked as lost: ${input.reason}`,
        };
      },
    },
  },
};
