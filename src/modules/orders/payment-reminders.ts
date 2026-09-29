import { channelReady, sendOnChannel, type ChannelId } from '@/core/channels';
import { getSql } from '@/core/db';
import { consumeEvents } from '@/core/events';
import { getInbound, lastWhatsAppFrom, linkInbound } from '@/core/intake';
import { getCaseById, ruleActor, runStep } from '@/core/jobs';
import { formatPaise } from '@/core/money';
import { balanceOf, orderJob, type OrderCase } from './order-job';
import { dueReminder, getPaymentRules } from './payment-settings';

// Payment reminders, and buyer messages about an open order.
// The reminder rule runs on the background loop. For each dispatched,
// unpaid order it sends the reminder that has fallen due (see dueReminder),
// once, on a channel Forge may use. When no channel is open, the reminder
// goes to a person on Up next instead.

const REMINDER = ruleActor('orders.payment-reminder', 'Reminder rule');
const ORDER_MESSAGES = ruleActor('orders.buyer-message', 'Intake rule');
const WHATSAPP_WINDOW_MS = 24 * 60 * 60 * 1000;

async function routeFor(order: OrderCase): Promise<{ channel: ChannelId; to: string } | null> {
  const { phone, email } = order.subject;
  if (email && await channelReady('email')) return { channel: 'email', to: email };
  if (phone && await channelReady('whatsapp')) {
    const last = await lastWhatsAppFrom(phone);
    if (last && Date.now() - last.getTime() < WHATSAPP_WINDOW_MS) return { channel: 'whatsapp', to: phone };
  }
  return null;
}

function reminderText(order: OrderCase, kind: 'before' | 'due' | 'overdue', businessName: string): string {
  const balance = formatPaise(balanceOf(order.data));
  const due = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'long', timeZone: 'Asia/Kolkata' }).format(new Date(order.data.payment!.dueAt!));
  const lead = kind === 'before' ? `a reminder that payment of ${balance} for order ${order.ref} is due on ${due}.`
    : kind === 'due' ? `payment of ${balance} for order ${order.ref} is due today.`
      : `payment of ${balance} for order ${order.ref} was due on ${due} and is still open.`;
  return `Hello ${order.subject.buyerName}, ${lead} Please reply with the payment reference once paid. If you have already paid, thank you, and please ignore this message.\n\n${businessName}`;
}

let lastRun = 0;

export async function runPaymentReminders(opts: { force?: boolean; now?: Date; businessName?: string } = {}): Promise<number> {
  if (!opts.force && Date.now() - lastRun < 5 * 60 * 1000) return 0;
  lastRun = Date.now();
  const rules = await getPaymentRules();
  if (!rules.remindersOn) return 0;
  const sql = getSql();
  const orders = await sql<OrderCase[]>`select * from cases where job = 'order' and state = 'dispatched' and closed_at is null`;
  const [settings] = await sql<{ value: { businessName?: string } }[]>`select value from settings where key = 'sales'`;
  const businessName = opts.businessName ?? settings?.value?.businessName ?? 'Our team';
  let handled = 0;
  for (const order of orders) {
    const payment = order.data.payment;
    if (!payment?.dueAt || balanceOf(order.data) === 0) continue;
    const due = dueReminder(new Date(payment.dueAt), opts.now ?? new Date(), rules, payment.reminders.map((r) => r.key));
    if (!due) continue;
    const text = reminderText(order, due.kind, businessName);
    const route = await routeFor(order);
    let sent = false;
    if (route) {
      const result = await sendOnChannel(route.channel, { to: route.to, subject: `Payment reminder: ${order.ref}`, text, caseId: order.id });
      sent = result.ok;
    }
    await runStep(orderJob, order.id, 'sendReminder', { key: due.key, sent, channel: route?.channel ?? null, text }, REMINDER);
    handled += 1;
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
