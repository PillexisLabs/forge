// Seeds the quote-to-order flow with sample data that arrives the way real
// data does: through the WhatsApp, Google Sheets and webhook intake, then
// the matching, sending and reply rules. A few steps are done "by a person"
// (checking a draft, approving) so every state is on screen.
//
//   npm run jobs:seed-demo                    # replace the sample data
//   npm run jobs:seed-demo -- --wipe          # remove the sample data only
//   npm run jobs:seed-demo -- --allow-remote  # required for staging
//
// Sample rows are tagged (inv_items.fixture, inbound_messages.fixture,
// cases.data.fixture) and the script deletes only those. It also switches
// WhatsApp on in test mode when WhatsApp is not set up yet, so replies are
// recorded but never sent. Staging holds sample data only; never run this
// against production.

import { getSql } from '../src/core/db';
import { getIntegration, saveIntegration } from '../src/core/integrations';
import { recordInbound, type IntakeSource } from '../src/core/intake';
import { createCase, runStep, userActor, type CaseRecord } from '../src/core/jobs';
import type { SessionUser } from '../src/core/users';
import { runJobConsumers } from '../src/modules/jobs';
import { orderJob } from '../src/modules/orders/order-job';
import { runPaymentReminders } from '../src/modules/orders/payment-reminders';
import { quoteJob } from '../src/modules/sales/quote-job';

const ITEMS = [
  // sku, name, unit, rate (₹), hsn, on hand, incoming local, incoming import
  ['SUP-250-2C', 'Stand-up pouch 250 ml, 2 colour', 'pcs', 3.4, '3923', 12000, 5000, 0],
  ['SUP-500-4C', 'Stand-up pouch 500 ml, 4 colour', 'pcs', 5.1, '3923', 4000, 0, 20000],
  ['ZIP-1KG-CL', 'Zipper pouch 1 kg, clear', 'pcs', 6.8, '3923', 8500, 0, 0],
  ['SPT-200', 'Spout pouch 200 ml', 'pcs', 9.4, '3923', 1500, 3000, 0],
  ['BOPP-5KG', 'BOPP woven bag 5 kg', 'pcs', 14.5, '6305', 6000, 0, 0],
  ['LAM-12M', 'Laminated roll, 12 micron', 'kg', 265, '3920', 900, 0, 2000],
] as const;

const person = (name: string, role: SessionUser['role'] = 'admin'): SessionUser => ({
  id: 0, email: 'sample-data@forge.local', name, role, modules: [], sessionVersion: 0, status: 'active',
});
const SALES = userActor(person('Priya (sample)', 'member'));
const OWNER = userActor(person('Owner (sample)'));

type Buyer = { name: string; company: string; phone: string; email?: string };

type Plan = {
  source: IntakeSource | 'manual';
  buyer: Buyer;
  messages: string[];
  /** How far a person takes it after Forge drafts it. */
  then?: ('submit' | 'approve' | 'markSent' | 'accept' | 'dispatch' | 'lose')[];
  /** Buyer replies after the quote went out. */
  replies?: string[];
  /** What happens to the order after that. */
  order?: ('dispatch' | 'payInFull' | 'makeOverdue')[];
  /** Buyer messages after the order steps. */
  laterReplies?: string[];
  hoursAgo: number;
};

const PLANS: Plan[] = [
  { source: 'whatsapp', buyer: { name: 'Rahul Mehta', company: 'Mehta Namkeen', phone: '9845011223' },
    messages: ['Hi, need 5000 stand-up pouches 250 ml, 2 colour print. Please send rate.'], hoursAgo: 1 },
  { source: 'whatsapp', buyer: { name: 'Meera Joshi', company: 'Joshi Masala', phone: '9740033445' },
    messages: ['Need 4000 pouches 250 ml 2 colour for masala, same print as last time. Delivery 560058'], hoursAgo: 2 },
  { source: 'sheets', buyer: { name: 'Vikram Rao', company: 'Rao Agro Exports', phone: '9886077889', email: 'vikram@raoagro.example' },
    messages: ['Requirement: 20,000 stand-up pouches 500 ml, 4 colour, for export packing. Delivery pincode 600032'], then: ['submit'], hoursAgo: 4 },
  { source: 'webhook', buyer: { name: 'Sana Iqbal', company: 'Sana Dry Fruits', phone: '9900144556' },
    messages: ['Looking for pouches for dry fruits, around 3000 pieces. Please call.'], hoursAgo: 5 },
  { source: 'whatsapp', buyer: { name: 'Arjun Shetty', company: 'Coastal Rice Mills', phone: '9448055667' },
    messages: ['Need 2000 BOPP bags 5 kg for rice', 'Pin 575001'], then: ['submit'], replies: ['Can you do Rs 13.50 per bag if we take 3000?'], hoursAgo: 6 },
  { source: 'whatsapp', buyer: { name: 'Kavya Nair', company: 'Nair Coffee Works', phone: '9845188990' },
    messages: ['Please quote 6000 stand-up pouches 250 ml and 3000 zipper pouches 1 kg. Delivery 560037'], then: ['submit'], replies: ['Ok confirmed, go ahead'],
    order: ['dispatch', 'makeOverdue'], laterReplies: ['Payment done by NEFT today, UTR 2026092912345'], hoursAgo: 8 },
  { source: 'manual', buyer: { name: 'Imran Khan', company: 'Khan Foods', phone: '9986012121' },
    messages: ['Called: wants 1200 spout pouches 200 ml, urgent, delivery 560045'], then: ['submit', 'markSent', 'accept', 'dispatch'], order: ['payInFull'], hoursAgo: 30 },
  { source: 'whatsapp', buyer: { name: 'Pooja Rao', company: 'Rao Bakes', phone: '9980012345' },
    messages: ['Need 2500 zipper pouches 1 kg clear. Delivery 560011'], then: ['submit'], replies: ['Confirmed'], order: ['dispatch'], hoursAgo: 12 },
  { source: 'whatsapp', buyer: { name: 'Deepa Kulkarni', company: 'Kulkarni Snacks', phone: '9731145454' },
    messages: ['10,000 stand-up pouches 250 ml 2 colour, delivery 580020. What is your best price?'], then: ['lose'], hoursAgo: 50 },
];

let serial = 0;

async function inbound(plan: Plan, body: string) {
  serial += 1;
  await recordInbound({
    source: plan.source === 'manual' ? 'test' : plan.source,
    externalId: `fixture-${Date.now()}-${serial}`,
    fromName: plan.buyer.name,
    fromPhone: plan.buyer.phone,
    fromEmail: plan.buyer.email ?? null,
    company: plan.source === 'whatsapp' ? null : plan.buyer.company,
    body,
    fixture: true,
  });
  await runJobConsumers();
}

async function caseFor(phone: string): Promise<CaseRecord | null> {
  const sql = getSql();
  const rows = await sql<CaseRecord[]>`
    select * from cases where job = 'quote' and subject->>'phone' = ${`91${phone}`} order by id desc limit 1
  `;
  return rows[0] ?? null;
}

async function tag(caseId: number) {
  const sql = getSql();
  await sql`update cases set data = data || '{"fixture": true}'::jsonb where id = ${caseId}`;
}

async function wipe() {
  const sql = getSql();
  const fixtureCases = await sql<{ id: number; ref: string; job: string }[]>`
    select id, ref, job from cases where (data->>'fixture')::boolean is true
       or parent_case_id in (select id from cases where (data->>'fixture')::boolean is true)
  `;
  const ids = fixtureCases.map((c) => c.id);
  const orderRefs = fixtureCases.filter((c) => c.job === 'order').map((c) => c.ref);
  if (orderRefs.length) await sql`delete from inv_commitments where order_ref = any(${orderRefs})`;
  if (ids.length) {
    await sql`delete from outbound_messages where case_id = any(${ids})`;
    await sql`delete from cases where id = any(${ids}) and job = 'order'`;
    await sql`delete from cases where id = any(${ids})`;
  }
  await sql`delete from inbound_messages where fixture`;
  await sql`delete from inv_commitments where sku in (select sku from inv_items where fixture)`;
  await sql`delete from inv_items where fixture`;
  // Restart ref numbers for a job with no cases left, so a reset demo starts at Q-1001.
  await sql`delete from case_counters where job not in (select distinct job from cases)`;
  console.log(`Removed sample data (${ids.length} cases).`);
}

/** Spread one case's steps and messages back in time, a few minutes apart, in their real order. */
async function backdate(caseId: number, hoursAgo: number) {
  const sql = getSql();
  const rows = await sql<{ tbl: string; id: number }[]>`
    select * from (
      select 'case_steps' as tbl, s.id, s.created_at as at from case_steps s join cases c on c.id = s.case_id where c.id = ${caseId} or c.parent_case_id = ${caseId}
      union all select 'inbound_messages', id, received_at from inbound_messages where case_id = ${caseId}
      union all select 'outbound_messages', id, created_at from outbound_messages where case_id = ${caseId}
    ) t order by at, tbl
  `;
  for (const [i, row] of rows.entries()) {
    const at = sql`now() - make_interval(hours => ${hoursAgo}) + make_interval(mins => ${i * 6})`;
    if (row.tbl === 'case_steps') await sql`update case_steps set created_at = ${at} where id = ${row.id}`;
    else if (row.tbl === 'inbound_messages') await sql`update inbound_messages set received_at = ${at} where id = ${row.id}`;
    else await sql`update outbound_messages set created_at = ${at} where id = ${row.id}`;
  }
  await sql`
    update cases c set data = jsonb_set(c.data, '{sent,at}', to_jsonb(s.created_at))
    from case_steps s
    where c.id = ${caseId} and s.case_id = c.id and s.step = 'markSent' and c.data ? 'sent'
  `;
  await sql`
    update cases c set
      created_at = coalesce((select min(created_at) from case_steps where case_id = c.id), c.created_at),
      updated_at = coalesce((select max(created_at) from case_steps where case_id = c.id), c.updated_at)
    where c.id = ${caseId} or c.parent_case_id = ${caseId}
  `;
}

async function seed() {
  const sql = getSql();
  for (const [sku, name, unit, rate, hsn, onHand, local, imported] of ITEMS) {
    await sql`
      insert into inv_items (sku, name, unit, rate_paise, hsn, on_hand, incoming_local, incoming_import, fixture)
      values (${sku}, ${name}, ${unit}, ${Math.round(rate * 100)}, ${hsn}, ${onHand}, ${local}, ${imported}, true)
      on conflict (sku) do nothing
    `;
  }

  // Replies are recorded, never sent, until someone connects a real number.
  const wa = await getIntegration('whatsapp');
  if (!wa.enabled && wa.updated_by === null) {
    await saveIntegration('whatsapp', { enabled: true, config: { testMode: true }, status: 'connected' }, 'Sample data');
  }

  for (const plan of PLANS) {
    let current: CaseRecord | null;
    if (plan.source === 'manual') {
      current = await createCase(quoteJob, 'recordEnquiry', {
        buyerName: plan.buyer.name, company: plan.buyer.company, phone: plan.buyer.phone, channel: 'phone', message: plan.messages[0],
      }, SALES);
      await tag(current.id);
      await runJobConsumers();
    } else {
      await inbound(plan, plan.messages[0]);
      current = await caseFor(plan.buyer.phone);
      if (!current) throw new Error(`No case for ${plan.buyer.company}`);
      await tag(current.id);
      for (const extra of plan.messages.slice(1)) await inbound(plan, extra);
    }
    const reload = async () => (await sql<CaseRecord[]>`select * from cases where id = ${current!.id}`)[0];
    current = await reload();

    for (const action of plan.then ?? []) {
      current = await reload();
      if (action === 'submit' && current.state === 'draft') await runStep(quoteJob, current.id, 'submitQuote', {}, SALES);
      if (action === 'approve' && current.state === 'awaiting_approval') {
        await runStep(quoteJob, current.id, 'approveQuote', { version: (current.data as { quote: { version: number } }).quote.version }, OWNER);
      }
      if (action === 'markSent' && current.state === 'approved') await runStep(quoteJob, current.id, 'markSent', { channel: 'whatsapp' }, SALES);
      if (action === 'accept' && current.state === 'sent') await runStep(quoteJob, current.id, 'markAccepted', { buyerPo: 'KF-0918', note: 'confirmed on a phone call' }, SALES);
      if (action === 'lose') await runStep(quoteJob, current.id, 'markLost', { reason: 'The buyer chose a supplier with a lower rate.' }, SALES);
      await runJobConsumers();
      if (action === 'dispatch') {
        const [order] = await sql<CaseRecord[]>`select * from cases where parent_case_id = ${current.id} and job = 'order'`;
        if (order) {
          await runStep(orderJob, order.id, 'dispatchOrder', { vehicle: 'KA 51 AB 4412' }, userActor(person('Ravi (sample)', 'member')));
          await runJobConsumers();
        }
      }
    }
    for (const reply of plan.replies ?? []) await inbound(plan, reply);

    const [order0] = await sql<CaseRecord[]>`select * from cases where parent_case_id = ${current.id} and job = 'order'`;
    for (const action of plan.order ?? []) {
      const [order] = await sql<CaseRecord[]>`select * from cases where id = ${order0?.id ?? 0}`;
      if (!order) break;
      if (action === 'dispatch' && order.state === 'confirmed') {
        await runStep(orderJob, order.id, 'dispatchOrder', { vehicle: 'KA 01 MX 2207' }, userActor(person('Ravi (sample)', 'member')));
      }
      if (action === 'payInFull' && order.state === 'dispatched') {
        const total = (order.data as { totalPaise: number }).totalPaise / 100;
        await runStep(orderJob, order.id, 'recordPayment', { amount: total, mode: 'NEFT', reference: 'UTR2026092800451' }, OWNER);
      }
      if (action === 'makeOverdue' && order.state === 'dispatched') {
        // Move the due date 4 days back, then let the reminder rule run once.
        await sql`update cases set data = jsonb_set(data, '{payment,dueAt}', to_jsonb((now() - interval '4 days')::text)) where id = ${order.id}`;
        await runPaymentReminders({ force: true });
      }
      await runJobConsumers();
    }
    for (const reply of plan.laterReplies ?? []) await inbound(plan, reply);

    current = await reload();
    await backdate(current.id, plan.hoursAgo);
    console.log(`${current.ref} ${plan.buyer.company} (${plan.source}): ${quoteJob.states[current.state].label}`);
  }
}

async function main() {
  const allowRemote = process.argv.includes('--allow-remote');
  const url = process.env.DATABASE_URL ?? '';
  let host = '';
  try { host = new URL(url).hostname; } catch { /* reported below */ }
  const isLocal = host === 'localhost' || host === '127.0.0.1';
  if (!isLocal && !allowRemote) {
    console.error(`DATABASE_URL points at "${host || 'unknown host'}", not localhost.`);
    console.error('Re-run with --allow-remote to seed a remote (staging) database on purpose. Never seed production.');
    process.exit(1);
  }

  await wipe();
  if (!process.argv.includes('--wipe')) await seed();
  await getSql().end();
}

main().catch(async (error) => {
  console.error(error);
  await getSql().end().catch(() => undefined);
  process.exit(1);
});
