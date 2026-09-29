import { channelReady, sendOnChannel, type ChannelId } from '@/core/channels';
import { getSql } from '@/core/db';
import { consumeEvents, emitEvent } from '@/core/events';
import { getInbound, lastWhatsAppFrom, linkInbound, type InboundRecord, type IntakeSource } from '@/core/intake';
import { createCase, getCaseById, ruleActor, runStep, StepError, type CaseRecord } from '@/core/jobs';
import { productSource } from '@/core/products';
import { isConfirmation, matchEnquiry } from './enquiry-match';
import { renderQuotePdf } from './quote-pdf';
import { CHANNEL_LABELS, quoteJob, type QuoteCase, type QuoteChannel, type QuoteData } from './quote-job';
import { quoteMessage } from './quote-rules';
import { getSalesRules } from './sales-settings';

// The quote job's automation. People only check, approve and answer
// exceptions; these rules do the rest:
//
//   message.received → a new enquiry, more detail on an open one, or the
//                      buyer's confirmation of a sent quote
//   (new detail)     → match the catalogue and draft the quote, or ask the
//                      buyer for what is missing
//   quote.approved   → send the quote and its PDF on the buyer's channel
//
// Each rule runs the quote job's normal steps as a `rule` actor, so every
// action is on the case timeline with the same checks a person gets.

const INTAKE = ruleActor('sales.intake', 'Intake rule');
const MATCH = ruleActor('sales.match', 'Matching rule');
const SEND = ruleActor('sales.send', 'Send rule');
const REPLY = ruleActor('sales.reply', 'Reply rule');

const WHATSAPP_WINDOW_MS = 24 * 60 * 60 * 1000;

function channelOfSource(source: IntakeSource): QuoteChannel {
  return source === 'test' ? 'whatsapp' : source;
}

async function findOpenQuote(phone: string | null, email: string | null): Promise<QuoteCase | null> {
  if (!phone && !email) return null;
  const sql = getSql();
  const rows = await sql<QuoteCase[]>`
    select * from cases
    where job = 'quote' and closed_at is null
      and ((${phone}::text is not null and subject->>'phone' = ${phone}) or (${email}::text is not null and subject->>'email' = ${email}))
    order by updated_at desc
    limit 1
  `;
  return rows[0] ?? null;
}

async function findOpenOrder(phone: string | null, email: string | null): Promise<{ id: number } | null> {
  if (!phone && !email) return null;
  const sql = getSql();
  const rows = await sql<{ id: number }[]>`
    select id from cases
    where job = 'order' and closed_at is null
      and ((${phone}::text is not null and subject->>'phone' = ${phone}) or (${email}::text is not null and subject->>'email' = ${email}))
    order by updated_at desc limit 1
  `;
  return rows[0] ?? null;
}

/** The channel Forge can reply on now, or null when a person must reply. */
export async function replyRoute(current: QuoteCase): Promise<{ channel: ChannelId; to: string } | null> {
  const { phone, email } = current.subject;
  const origin = current.data.enquiry.channel;
  if (phone && (origin === 'whatsapp') && await channelReady('whatsapp')) {
    const last = await lastWhatsAppFrom(phone);
    // WhatsApp allows free-form messages only inside the buyer's 24-hour window.
    if (last && Date.now() - last.getTime() < WHATSAPP_WINDOW_MS) return { channel: 'whatsapp', to: phone };
  }
  if (email && await channelReady('email')) return { channel: 'email', to: email };
  return null;
}

/**
 * The text the matching rule reads: every message the buyer sent on this
 * case, once each. The first email keeps its subject. A case typed in by a
 * person (no messages) uses the enquiry text.
 */
async function caseText(caseId: number, typed: string): Promise<string> {
  const sql = getSql();
  const rows = await sql<{ body: string; subject: string | null; source: string }[]>`
    select body, subject, source from inbound_messages where case_id = ${caseId} order by received_at
  `;
  if (!rows.length) return typed;
  return rows.map((row, i) => (i === 0 && row.source === 'email' && row.subject ? `${row.subject}\n${row.body}` : row.body)).join('\n');
}

/** Match the case's messages to the catalogue; draft the quote or ask for what is missing. */
async function draftOrAsk(current: QuoteCase): Promise<void> {
  const rules = await getSalesRules();
  if (!rules.autoDraft) return;
  const text = await caseText(current.id, current.data.enquiry.message);
  const match = matchEnquiry(text, await productSource().list());
  const pincode = match.pincode ?? current.data.quote?.pincode ?? null;

  if (match.lines.length && pincode) {
    try {
      await runStep(quoteJob, current.id, 'draftQuote', {
        lines: match.lines.map((line) => ({ sku: line.sku, quantity: line.quantity })),
        pincode,
        match: { matchedOn: Object.fromEntries(match.lines.map((line) => [line.sku, line.matchedOn])), unmatched: match.unmatched },
      }, MATCH);
    } catch (error) {
      if (!(error instanceof StepError)) throw error;
      console.warn(`sales: rule draft for ${current.ref} refused: ${error.message}`);
    }
    return;
  }

  const missing: string[] = [];
  if (!match.lines.length) missing.push(match.unmatched.length ? 'exact item (size and print)' : 'items and quantities');
  if (!pincode) missing.push('delivery pincode');
  // Do not ask the same question twice in a row.
  if (JSON.stringify(current.data.awaiting ?? []) === JSON.stringify(missing)) return;
  if (current.data.attention?.reason.startsWith('Ask the buyer for the')) return;

  const route = await replyRoute(current);
  let sent = false;
  if (route) {
    const result = await sendOnChannel(route.channel, {
      to: route.to,
      subject: 'Your enquiry',
      text: `Hello ${current.subject.buyerName}, thank you for your enquiry. Please share the ${missing.join(' and ')}, and we will send the quote right away.\n\n${rules.businessName}`,
      caseId: current.id,
    });
    sent = result.ok;
  }
  await runStep(quoteJob, current.id, 'askForDetails', { missing, sent, via: route?.channel ?? current.data.enquiry.channel }, MATCH);
}

async function handleInbound(inbound: InboundRecord): Promise<void> {
  const via = channelOfSource(inbound.source);
  const text = inbound.subject && inbound.source === 'email' ? `${inbound.subject}\n${inbound.body}` : inbound.body;
  const open = await findOpenQuote(inbound.from_phone, inbound.from_email);

  if (open) {
    await linkInbound(inbound.id, open.id, `Added to ${open.ref}`);
    if (open.state === 'sent' && isConfirmation(text)) {
      await runStep(quoteJob, open.id, 'addMessage', { text, via }, REPLY);
      const accepted = await runStep(quoteJob, open.id, 'markAccepted', { note: `confirmed on ${CHANNEL_LABELS[via]}` }, REPLY) as QuoteCase;
      const route = await replyRoute(accepted);
      if (route) {
        const rules = await getSalesRules();
        await sendOnChannel(route.channel, {
          to: route.to,
          subject: `Order confirmed: ${accepted.ref}`,
          text: `Thank you, ${accepted.subject.buyerName}. Your order for quote ${accepted.ref} is confirmed. We will share the dispatch date soon.\n\n${rules.businessName}`,
          caseId: accepted.id,
        });
      }
      return;
    }
    if (open.state === 'enquiry') {
      const updated = await runStep(quoteJob, open.id, 'addMessage', { text, via }, INTAKE) as QuoteCase;
      await draftOrAsk(updated);
      return;
    }
    await runStep(quoteJob, open.id, 'addMessage', {
      text, via, needsPerson: true, reason: `The buyer replied: “${text.replace(/\s+/g, ' ').slice(0, 140)}${text.length > 140 ? '…' : ''}”`,
    }, INTAKE);
    return;
  }

  // No open quote. A buyer with an open order who writes about payment or
  // delivery (not a new request) is talking about that order.
  const openOrder = await findOpenOrder(inbound.from_phone, inbound.from_email);
  if (openOrder) {
    const paymentTalk = /\b(paid|payment|utr|neft|rtgs|imps|upi|transfer(red)?|cheque|remit|dispatch|delivery|delivered|tracking|received)\b/i.test(text);
    const newRequest = matchEnquiry(text, await productSource().list()).lines.length > 0;
    if (paymentTalk || !newRequest) {
      const sql = getSql();
      await sql.begin(async (tx) => {
        await emitEvent('order.message', { v: 1, inbound_id: inbound.id, order_case_id: openOrder.id }, { emittedBy: 'sales', dedupeKey: `inbound:${inbound.id}`, sql: tx });
      });
      return;
    }
  }

  const created = await createCase(quoteJob, 'recordEnquiry', {
    buyerName: inbound.from_name,
    company: inbound.company,
    phone: inbound.from_phone,
    email: inbound.from_email,
    channel: via,
    message: text,
    inboundId: inbound.id,
  }, INTAKE) as QuoteCase;
  await linkInbound(inbound.id, created.id, `Created ${created.ref}`);
  // quote.recorded (emitted by the step) makes the matching rule draft it.
}

export async function consumeInboundMessages(): Promise<number> {
  return consumeEvents('sales.inbound-messages', ['message.received'], async (event) => {
    const inbound = await getInbound(Number(event.payload.inbound_id));
    if (!inbound || inbound.handled_at) return;
    await handleInbound(inbound);
  });
}

/** Every new enquiry, from intake or a person: match the items and draft the quote. */
export async function consumeRecordedEnquiries(): Promise<number> {
  return consumeEvents('sales.recorded-enquiries', ['quote.recorded'], async (event) => {
    const found = await getCaseById(Number(event.payload.quote_case_id)) as QuoteCase | null;
    if (!found || found.state !== 'enquiry' || found.data.quote) return;
    await draftOrAsk(found);
  });
}

/** Build the PDF for the case's current quote version. */
export async function quotePdfFor(current: QuoteCase): Promise<Uint8Array | null> {
  const quote = current.data.quote;
  if (!quote) return null;
  const rules = await getSalesRules();
  return renderQuotePdf({
    ref: current.ref,
    quote,
    subject: current.subject,
    business: { name: rules.businessName, address: rules.businessAddress, gstin: rules.businessGstin },
    approved: current.data.approval?.version === quote.version,
  });
}

async function sendApproved(caseId: number, version: number): Promise<void> {
  const found = await getCaseById(caseId) as QuoteCase | null;
  if (!found || found.state !== 'approved' || found.data.quote?.version !== version) return;
  const rules = await getSalesRules();
  if (!rules.autoSend) return;
  const route = await replyRoute(found);
  // No channel Forge may use (for example a WhatsApp window that closed):
  // the quote stays "Ready to send" for a person.
  if (!route) return;

  const pdf = await quotePdfFor(found);
  const result = await sendOnChannel(route.channel, {
    to: route.to,
    subject: `Quotation ${found.ref} from ${rules.businessName}`,
    text: quoteMessage({ buyerName: found.subject.buyerName, ref: found.ref, quote: found.data.quote!, businessName: rules.businessName }),
    attachment: pdf ? { filename: `${found.ref}.pdf`, mime: 'application/pdf', bytes: pdf } : undefined,
    caseId: found.id,
  });
  if (result.ok) await runStep(quoteJob, found.id, 'markSent', { channel: route.channel }, SEND);
}

export async function consumeApprovedQuotes(): Promise<number> {
  return consumeEvents('sales.approved-quotes', ['quote.approved'], async (event) => {
    await sendApproved(Number(event.payload.quote_case_id), Number(event.payload.version));
  });
}

export type { CaseRecord, QuoteData };
