import { channelReady, sendOnChannel, type ChannelId } from '@/core/channels';
import { getSql } from '@/core/db';
import { consumeEvents } from '@/core/events';
import { getInbound, lastWhatsAppFrom, linkInbound } from '@/core/intake';
import { getCaseById, ruleActor, runStep } from '@/core/jobs';
import { formatPaise } from '@/core/money';
import { financialYear, nextNumber } from '@/core/numbering';
import { getSettings } from '@/core/settings';
import { balanceOf, instalmentsOf, orderJob, type OrderCase, type OrderDocument } from './order-job';
import { renderOrderPdf } from './order-pdf';
import { getOrderRules } from './order-settings';
import { dueReminder, getPaymentRules, type Instalment } from './payment-settings';

// The order job's automation, all run as rules on the case timeline:
//   order.confirmed  → order confirmation to the buyer, and a payment request
//                      for an advance, when Settings asks for them
//   order.dispatched → a dispatch note, with the tax invoice or the payment
//                      request for the balance, when Settings asks for them
//   background loop  → payment reminders for every instalment that falls due
//   order.message    → a buyer message about an open order reaches that order

const DOCS = ruleActor('orders.documents', 'Documents rule');
const REMINDER = ruleActor('orders.payment-reminder', 'Reminder rule');
const ORDER_MESSAGES = ruleActor('orders.buyer-message', 'Intake rule');
const WHATSAPP_WINDOW_MS = 24 * 60 * 60 * 1000;

async function business() {
  const s = await getSettings<{ businessName: string; businessAddress: string; businessGstin: string }>('sales', { businessName: 'Our team', businessAddress: '', businessGstin: '' });
  return { name: s.businessName, address: s.businessAddress, gstin: s.businessGstin };
}

async function routeFor(order: OrderCase): Promise<{ channel: ChannelId; to: string } | null> {
  const { phone, email } = order.subject;
  if (phone && await channelReady('whatsapp')) {
    const last = await lastWhatsAppFrom(phone);
    if (last && Date.now() - last.getTime() < WHATSAPP_WINDOW_MS) return { channel: 'whatsapp', to: phone };
  }
  if (email && await channelReady('email')) return { channel: 'email', to: email };
  return null;
}

function dueText(i: Instalment): string {
  return i.dueAt ? new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'long', timeZone: 'Asia/Kolkata' }).format(new Date(i.dueAt)) : 'after dispatch';
}

/** Make one document, send it with a message, and record it on the order. */
async function sendDocument(order: OrderCase, kind: OrderDocument['kind'], number: string, text: string, instalment: Instalment | null) {
  if ((order.data.documents ?? []).some((d) => d.kind === kind && d.instalment === (instalment?.key ?? null))) return;
  const biz = await business();
  const pdf = await renderOrderPdf({
    kind, number, issuedAt: new Date().toISOString(), orderRef: order.ref, data: order.data, subject: order.subject,
    business: biz, instalments: instalmentsOf(order.data), instalment,
  });
  const route = await routeFor(order);
  let sent = false;
  if (route) {
    const subjects: Record<OrderDocument['kind'], string> = { order_confirmation: `Order confirmed: ${order.ref}`, payment_request: `Payment request ${number}`, tax_invoice: `Tax invoice ${number}` };
    const result = await sendOnChannel(route.channel, {
      to: route.to, subject: subjects[kind], text: `${text}\n\n${biz.name}`,
      attachment: { filename: `${number.replace(/[\\/]/g, '-')}.pdf`, mime: 'application/pdf', bytes: pdf }, caseId: order.id,
    });
    sent = result.ok;
  }
  await runStep(orderJob, order.id, 'sendDocument', { kind, number, instalment: instalment?.key ?? null, sent, channel: route?.channel ?? null }, DOCS);
}

async function reload(id: number) {
  return getCaseById(id) as Promise<OrderCase | null>;
}

export async function consumeOrderDocuments(): Promise<number> {
  return consumeEvents('orders.documents', ['order.confirmed', 'order.dispatched'], async (event) => {
    const sql = getSql();
    const [row] = await sql<OrderCase[]>`select * from cases where job = 'order' and ref = ${String(event.payload.order_ref ?? '')}`;
    if (!row || row.state === 'cancelled') return;
    const rules = await getOrderRules();
    let order: OrderCase = row;
    const name = order.subject.buyerName;
    const items = order.data.lines.map((l) => `• ${l.name}: ${l.quantity.toLocaleString('en-IN')} ${l.unit}`).join('\n');

    if (event.name === 'order.confirmed') {
      const upfront = instalmentsOf(order.data).find((i) => i.trigger === 'confirm' && i.paidPaise < i.amountPaise) ?? null;
      if (rules.sendConfirmation) {
        const payLine = upfront ? `\n${upfront.label} of ${formatPaise(upfront.amountPaise)} is due by ${dueText(upfront)}.` : '';
        await sendDocument(order, 'order_confirmation', order.ref, `Hello ${name}, your order ${order.ref} is confirmed:\n${items}\nTotal ${formatPaise(order.data.totalPaise)}.${payLine}`, null);
        order = (await reload(order.id)) ?? order;
      }
      if (upfront && rules.invoiceMode !== 'none') {
        await sendDocument(order, 'payment_request', `${order.ref}-PR1`, `Hello ${name}, please pay the ${upfront.label.toLowerCase()} of ${formatPaise(upfront.amountPaise)} for order ${order.ref} by ${dueText(upfront)}. Reply with the payment reference once paid.`, upfront);
      }
      return;
    }

    // order.dispatched
    const vehicle = order.data.dispatch?.vehicle ? ` on vehicle ${order.data.dispatch.vehicle}` : '';
    const open = instalmentsOf(order.data).find((i) => i.trigger === 'dispatch' && i.paidPaise < i.amountPaise) ?? null;
    const payLine = balanceOf(order.data) > 0 && open ? ` Payment of ${formatPaise(open.amountPaise - open.paidPaise)} is due by ${dueText(open)}.` : '';
    if (rules.invoiceMode === 'tax_invoice') {
      const number = await nextNumber(`${rules.invoicePrefix}${financialYear()}/`);
      await sendDocument(order, 'tax_invoice', number, `Hello ${name}, your order ${order.ref} is dispatched${vehicle}. The tax invoice ${number} is attached.${payLine}`, open);
    } else if (rules.invoiceMode === 'payment_request' && open) {
      await sendDocument(order, 'payment_request', `${order.ref}-PR2`, `Hello ${name}, your order ${order.ref} is dispatched${vehicle}.${payLine} The payment request is attached.`, open);
    } else {
      const route = await routeFor(order);
      if (route) await sendOnChannel(route.channel, { to: route.to, subject: `Dispatched: ${order.ref}`, text: `Hello ${name}, your order ${order.ref} is dispatched${vehicle}.${payLine}\n\n${(await business()).name}`, caseId: order.id });
    }
  });
}

let lastRun = 0;

/** Payment reminders for every instalment that has a due date and is not paid. */
export async function runPaymentReminders(opts: { force?: boolean; now?: Date } = {}): Promise<number> {
  if (!opts.force && Date.now() - lastRun < 5 * 60 * 1000) return 0;
  lastRun = Date.now();
  const rules = await getPaymentRules();
  if (!rules.remindersOn) return 0;
  const sql = getSql();
  const orders = await sql<OrderCase[]>`select * from cases where job = 'order' and state in ('confirmed', 'dispatched') and closed_at is null`;
  const biz = await business();
  let handled = 0;
  for (const order of orders) {
    if (balanceOf(order.data) === 0) continue;
    const sent = (order.data.payment?.reminders ?? []).map((r) => r.key);
    for (const inst of instalmentsOf(order.data)) {
      if (!inst.dueAt || inst.paidPaise >= inst.amountPaise) continue;
      const due = dueReminder(new Date(inst.dueAt), opts.now ?? new Date(), rules, sent, inst.key);
      if (!due) continue;
      const amount = formatPaise(inst.amountPaise - inst.paidPaise);
      const what = inst.key === 'balance' && instalmentsOf(order.data).length === 1 ? 'payment' : inst.label.toLowerCase();
      const lead = due.kind === 'before' ? `a reminder that the ${what} of ${amount} for order ${order.ref} is due on ${dueText(inst)}.`
        : due.kind === 'due' ? `the ${what} of ${amount} for order ${order.ref} is due today.`
          : `the ${what} of ${amount} for order ${order.ref} was due on ${dueText(inst)} and is still open.`;
      const text = `Hello ${order.subject.buyerName}, ${lead} Please reply with the payment reference once paid. If you have already paid, thank you, and please ignore this message.\n\n${biz.name}`;
      const route = await routeFor(order);
      let ok = false;
      if (route) ok = (await sendOnChannel(route.channel, { to: route.to, subject: `Payment reminder: ${order.ref}`, text, caseId: order.id })).ok;
      await runStep(orderJob, order.id, 'sendReminder', { key: due.key, sent: ok, channel: route?.channel ?? null, text }, REMINDER);
      handled += 1;
      break; // one reminder per order per pass
    }
  }
  return handled;
}

/** A buyer message routed to an open order (payment reference, delivery question). */
export async function consumeOrderMessages(): Promise<number> {
  return consumeEvents('orders.buyer-messages', ['order.message'], async (event) => {
    const inbound = await getInbound(Number(event.payload.inbound_id));
    const order = await getCaseById(Number(event.payload.order_case_id)) as OrderCase | null;
    if (!inbound || !order || order.closed_at) return;
    await runStep(orderJob, order.id, 'addMessage', { text: inbound.body, via: inbound.source }, ORDER_MESSAGES);
    await linkInbound(inbound.id, order.id, `Added to ${order.ref}`);
  });
}
