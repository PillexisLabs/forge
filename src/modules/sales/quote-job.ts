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
import { getSalesRules } from './sales-settings';

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

export const QUOTE_CHANNELS = ['whatsapp', 'email', 'sheets', 'webhook', 'phone', 'walk_in'] as const;
export type QuoteChannel = (typeof QUOTE_CHANNELS)[number];

export const CHANNEL_LABELS: Record<QuoteChannel, string> = {
  whatsapp: 'WhatsApp',
  email: 'Email',
  sheets: 'Google Sheets',
  webhook: 'Webhook',
  phone: 'Phone call',
  walk_in: 'Walk-in',
};

export type QuoteSubject = {
  buyerName: string;
  company: string | null;
  /** Digits with country code, e.g. 919845012345. */
  phone: string | null;
  email: string | null;
};

const OPEN_STATES = ['enquiry', 'draft', 'awaiting_approval', 'approved', 'sent'];

export type QuoteData = {
  enquiry: { channel: QuoteChannel; message: string; inboundId?: number | null };
  /** Who drafted the current version: a person, or the matching rule. */
  draftedBy?: 'user' | 'rule';
  /** What the matching rule read from the message, for the person who checks it. */
  match?: { matchedOn: Record<string, string[]>; unmatched: string[] } | null;
  /** Details the rule asked the buyer for. */
  awaiting?: string[];
  /** A buyer message that a person must answer. */
  attention?: { reason: string; at: string } | null;
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

function normPhone(phone: string | null): string | null {
  const digits = (phone ?? '').replace(/\D/g, '');
  if (!digits) return null;
  return digits.length === 10 ? `91${digits}` : digits;
}

function approvedEvent(version: number) {
  return (saved: CaseRecord) => [{
    name: 'quote.approved' as const,
    dedupeKey: `case:${saved.id}:v${version}`,
    payload: { v: 1, quote_case_id: saved.id, version },
  }];
}

export const quoteJob: JobDefinition = {
  job: 'quote',
  module: 'sales',
  label: 'Quote',
  refPrefix: 'Q',
  customerOf(c) {
    const subject = c.subject as QuoteSubject;
    const data = c.data as QuoteData;
    if (!subject.buyerName) return null;
    return { name: subject.buyerName, company: subject.company ?? null, phone: subject.phone ?? null, email: subject.email ?? null, gstin: null, pincode: data.quote?.pincode ?? null };
  },
  states: {
    enquiry: { label: 'New enquiry', assignee: 'sales' },
    draft: { label: 'Quote draft', assignee: 'sales' },
    awaiting_approval: { label: 'Waiting for approval', assignee: 'approver' },
    approved: { label: 'Ready to send', assignee: 'sales' },
    // Nobody needs to act: the buyer's reply (or a person's "Buyer accepted") moves it on.
    sent: { label: 'Sent, waiting for buyer', assignee: null },
    accepted: { label: 'Accepted', assignee: null, terminal: true },
    lost: { label: 'Lost', assignee: null, terminal: true },
  },
  steps: {
    recordEnquiry: {
      label: 'Record enquiry',
      from: [],
      to: ['enquiry'],
      permission: 'sales:write',
      // 'rule' is the intake rule: an integration message becomes an enquiry.
      actors: ['user', 'rule'],
      parse(raw) {
        const input = inputObject(raw);
        const phone = optionalText(input, 'phone', 20);
        const email = optionalText(input, 'email', 160);
        return {
          buyerName: optionalText(input, 'buyerName', 120) ?? phone ?? email ?? 'Unknown buyer',
          company: optionalText(input, 'company', 160),
          phone: normPhone(phone),
          email: email?.toLowerCase() ?? null,
          channel: channelOf(input.channel),
          message: requiredText(input, 'message', 'The enquiry text', 4000),
          inboundId: typeof input.inboundId === 'number' ? input.inboundId : null,
        };
      },
      async run({ actor }, input) {
        const via = CHANNEL_LABELS[input.channel as QuoteChannel];
        return {
          title: input.company ?? input.buyerName,
          subject: { buyerName: input.buyerName, company: input.company, phone: input.phone, email: input.email },
          data: { enquiry: { channel: input.channel, message: input.message, inboundId: input.inboundId } },
          summary: actor.kind === 'rule'
            ? `A new enquiry from ${input.buyerName} arrived on ${via}.`
            : `Recorded an enquiry from ${input.buyerName}. It came by ${via.toLowerCase()}.`,
          // The matching rule listens for this and drafts the quote.
          events: (saved) => [{ name: 'quote.recorded', dedupeKey: `case:${saved.id}`, payload: { v: 1, quote_case_id: saved.id } }],
        };
      },
    },

    addMessage: {
      label: 'Add buyer message',
      from: OPEN_STATES,
      to: OPEN_STATES,
      permission: 'sales:write',
      actors: ['user', 'rule'],
      parse(raw) {
        const input = inputObject(raw);
        return {
          text: requiredText(input, 'text', 'The message', 4000),
          via: channelOf(input.via),
          needsPerson: input.needsPerson === true,
          reason: optionalText(input, 'reason', 300),
        };
      },
      async run({ current }, input) {
        return {
          to: current!.state,
          data: input.needsPerson
            ? { attention: { reason: input.reason ?? 'The buyer sent a message that needs an answer.', at: new Date().toISOString() } }
            : {},
          summary: `The buyer wrote on ${CHANNEL_LABELS[input.via as QuoteChannel]}: "${input.text.slice(0, 160)}${input.text.length > 160 ? '…' : ''}"`
            + (input.needsPerson ? ' A person must answer it.' : ''),
        };
      },
    },

    askForDetails: {
      label: 'Ask the buyer for details',
      from: ['enquiry'],
      to: ['enquiry'],
      permission: 'sales:write',
      actors: ['rule', 'user'],
      parse(raw) {
        const input = inputObject(raw);
        const missing = Array.isArray(input.missing) ? input.missing.map(String) : [];
        if (!missing.length) throw new StepError('Name the details to ask for.');
        return { missing, sent: input.sent === true, via: channelOf(input.via) };
      },
      async run(_ctx, input) {
        return {
          // Only a question that went out waits on the buyer; otherwise a person must ask it.
          data: input.sent
            ? { awaiting: input.missing, attention: null }
            : { awaiting: [], attention: { reason: `Ask the buyer for the ${input.missing.join(' and ')}. Forge cannot message them on this channel.`, at: new Date().toISOString() } },
          summary: input.sent
            ? `Asked the buyer for the ${input.missing.join(' and ')} on ${CHANNEL_LABELS[input.via as QuoteChannel]}.`
            : `The ${input.missing.join(' and ')} is missing. The message could not be sent, so a person must ask.`,
        };
      },
    },

    markHandled: {
      label: 'Mark message as answered',
      from: OPEN_STATES,
      to: OPEN_STATES,
      permission: 'sales:write',
      parse: () => ({}),
      async run({ current }) {
        return { to: current!.state, data: { attention: null }, summary: 'Answered the buyer’s message.' };
      },
    },

    sendReply: {
      label: 'Reply to the buyer',
      from: OPEN_STATES,
      to: OPEN_STATES,
      permission: 'sales:write',
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

    draftQuote: {
      label: 'Save quote draft',
      from: ['enquiry', 'draft', 'approved'],
      to: ['draft'],
      permission: 'sales:write',
      // 'rule' is the matching rule. A person checks every rule draft.
      actors: ['user', 'rule'],
      parse(raw) {
        const input = inputObject(raw);
        const match = input.match && typeof input.match === 'object' ? input.match as QuoteData['match'] : null;
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
        return { lines: parsed, pincode, match };
      },
      async run({ tx, current, actor }, input) {
        const rules = await getSalesRules();
        const source = productSource();
        const products = await source.get(input.lines.map((line: QuoteLineInput) => line.sku), tx);
        const previous = (current?.data as QuoteData | undefined)?.quote;
        let quote: PricedQuote;
        try {
          quote = priceQuote(input.lines, products, {
            pincode: input.pincode,
            freight: { localPinPrefixes: rules.localPinPrefixes, localRupees: rules.freightLocalRupees, outstationRupees: rules.freightOutstationRupees },
            version: (previous?.version ?? 0) + 1,
            validDays: rules.quoteValidDays,
            priceSource: source.label,
          });
        } catch (error) {
          throw new StepError(error instanceof Error ? error.message : String(error));
        }
        const wasApproved = current?.state === 'approved';
        const byRule = actor.kind === 'rule';
        return {
          data: { quote, approval: null, draftedBy: byRule ? 'rule' : 'user', match: byRule ? input.match : null, awaiting: [] },
          summary: (byRule ? `Matched the message to the catalogue and drafted v${quote.version}` : `Saved quote draft v${quote.version}`)
            + `: ${quote.lines.length} ${quote.lines.length === 1 ? 'item' : 'items'}, total ${formatPaise(quote.totalPaise)}.`
            + (byRule ? ' A person must check it.' : '')
            + (wasApproved ? ' The earlier approval no longer applies.' : ''),
        };
      },
    },

    submitQuote: {
      label: 'Approve and send',
      from: ['draft'],
      to: ['awaiting_approval', 'approved'],
      permission: 'sales:write',
      parse: () => ({}),
      async run({ current, actor }) {
        const quote = quoteOf(current);
        const rules = await getSalesRules();
        const limit = rules.approvalLimitRupees;
        if (rules.approvalMode === 'always' || needsApproval(quote.totalPaise, limit)) {
          return {
            to: 'awaiting_approval',
            summary: rules.approvalMode === 'always'
              ? `Checked v${quote.version}. Every quote needs an approver, so it waits for one.`
              : `Checked v${quote.version}. The total ${formatPaise(quote.totalPaise)} is above the ${formatPaise(limit * 100)} limit, so an approver must approve it.`,
          };
        }
        return {
          to: 'approved',
          data: { approval: { version: quote.version, by: actor.name, at: new Date().toISOString(), basis: 'within_limit' }, attention: null },
          summary: `Checked v${quote.version}. The total ${formatPaise(quote.totalPaise)} is within the ${formatPaise(limit * 100)} limit, so it goes to the buyer.`,
          events: approvedEvent(quote.version),
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
          events: approvedEvent(quote.version),
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
      // 'rule' is the send rule: Forge sent the quote on the buyer's channel.
      actors: ['user', 'rule'],
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
          summary: `Sent v${quote.version} with the PDF to the buyer on ${CHANNEL_LABELS[input.channel as QuoteChannel]}.`,
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
      // 'rule' is the reply rule: the buyer answered "confirm".
      actors: ['user', 'rule'],
      parse(raw) {
        const input = inputObject(raw);
        return { buyerPo: optionalText(input, 'buyerPo', 80), note: optionalText(input, 'note', 1000) };
      },
      async run({ current }, input) {
        const quote = quoteOf(current);
        const subject = current?.subject as QuoteSubject;
        return {
          data: { outcome: { result: 'accepted', note: input.note, buyerPo: input.buyerPo, at: new Date().toISOString() }, attention: null },
          summary: `The buyer accepted v${quote.version}${input.buyerPo ? ` with PO ${input.buyerPo}` : ''}${input.note ? `: ${input.note}` : ''}.`,
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
