// Seeds the manual delivery flow with sample data: a packaging maker's
// catalogue and stock, and quotes and orders in every state.
//
//   npm run jobs:seed-demo                  # replace the sample data
//   npm run jobs:seed-demo -- --wipe        # remove the sample data only
//   npm run jobs:seed-demo -- --allow-remote   # required for staging
//
// Every case is made by running the real steps through the job engine, so
// the timelines, events and stock commitments are what the app would make.
// Sample rows are tagged (inv_items.fixture, cases.data.fixture) and the
// script deletes only those. Staging holds sample data only; never run this
// against production.

import { getSql } from '../src/core/db';
import { createCase, runStep, userActor, type Actor, type CaseRecord } from '../src/core/jobs';
import type { SessionUser } from '../src/core/users';
import { runJobConsumers } from '../src/modules/jobs';
import { orderJob } from '../src/modules/orders/order-job';
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

const seedUser: SessionUser = {
  id: 0, email: 'sample-data@forge.local', name: 'Priya (sample)', role: 'admin', modules: [],
  sessionVersion: 0, status: 'active',
};
const approverUser: SessionUser = { ...seedUser, name: 'Owner (sample)' };
const SALES = userActor(seedUser);
const OWNER = userActor(approverUser);

type Plan = {
  buyer: { buyerName: string; company: string; phone: string; channel: string; message: string };
  lines?: { sku: string; quantity: number }[];
  pincode?: string;
  /** How far the case goes. */
  until: 'enquiry' | 'draft' | 'awaiting_approval' | 'approved' | 'sent' | 'accepted' | 'lost';
  lostReason?: string;
  buyerPo?: string;
  thenDispatch?: boolean;
  hoursAgo: number;
};

const PLANS: Plan[] = [
  {
    buyer: { buyerName: 'Rahul Mehta', company: 'Mehta Namkeen', phone: '98450 11223', channel: 'whatsapp', message: 'Hi, need 5000 stand-up pouches 250 ml, 2 colour print. Delivery Peenya. Please send rate.' },
    until: 'enquiry', hoursAgo: 1,
  },
  {
    buyer: { buyerName: 'Sana Iqbal', company: 'Sana Dry Fruits', phone: '99001 44556', channel: 'phone', message: 'Wants zipper pouches 1 kg clear, about 3000, and 1000 spout pouches for a new juice line.' },
    lines: [{ sku: 'ZIP-1KG-CL', quantity: 3000 }, { sku: 'SPT-200', quantity: 1000 }], pincode: '560010',
    until: 'draft', hoursAgo: 3,
  },
  {
    buyer: { buyerName: 'Vikram Rao', company: 'Rao Agro Exports', phone: '98860 77889', channel: 'email', message: 'Requirement: 20,000 stand-up pouches 500 ml, 4 colour, for export packing. Delivery Chennai.' },
    lines: [{ sku: 'SUP-500-4C', quantity: 20000 }], pincode: '600032',
    until: 'awaiting_approval', hoursAgo: 5,
  },
  {
    buyer: { buyerName: 'Meera Joshi', company: 'Joshi Masala', phone: '97400 33445', channel: 'whatsapp', message: 'Need 4000 pouches 250 ml for masala. Same print as last time.' },
    lines: [{ sku: 'SUP-250-2C', quantity: 4000 }], pincode: '560058',
    until: 'approved', hoursAgo: 8,
  },
  {
    buyer: { buyerName: 'Arjun Shetty', company: 'Coastal Rice Mills', phone: '94480 55667', channel: 'walk_in', message: 'Came to the office. Wants 2000 BOPP bags 5 kg for rice.' },
    lines: [{ sku: 'BOPP-5KG', quantity: 2000 }], pincode: '575001',
    until: 'sent', hoursAgo: 26,
  },
  {
    buyer: { buyerName: 'Kavya Nair', company: 'Nair Coffee Works', phone: '98451 88990', channel: 'whatsapp', message: 'Please quote 6000 stand-up pouches 250 ml and 3000 zipper pouches 1 kg.' },
    lines: [{ sku: 'SUP-250-2C', quantity: 6000 }, { sku: 'ZIP-1KG-CL', quantity: 3000 }], pincode: '560037',
    until: 'accepted', buyerPo: 'NCW/PO/2291', hoursAgo: 50,
  },
  {
    buyer: { buyerName: 'Imran Khan', company: 'Khan Foods', phone: '99860 12121', channel: 'phone', message: 'Wants 1200 spout pouches 200 ml, urgent.' },
    lines: [{ sku: 'SPT-200', quantity: 1200 }], pincode: '560045',
    until: 'accepted', buyerPo: 'KF-0918', thenDispatch: true, hoursAgo: 96,
  },
  {
    buyer: { buyerName: 'Deepa Kulkarni', company: 'Kulkarni Snacks', phone: '97311 45454', channel: 'whatsapp', message: '10,000 pouches 250 ml. What is your best price?' },
    lines: [{ sku: 'SUP-250-2C', quantity: 10000 }], pincode: '580020',
    until: 'lost', lostReason: 'The buyer chose a supplier with a lower rate.', hoursAgo: 120,
  },
];

const ORDER_OF_STATES = ['enquiry', 'draft', 'awaiting_approval', 'approved', 'sent', 'accepted'] as const;

function reached(plan: Plan, state: (typeof ORDER_OF_STATES)[number]): boolean {
  if (plan.until === 'lost') return ORDER_OF_STATES.indexOf(state) <= ORDER_OF_STATES.indexOf('sent');
  return ORDER_OF_STATES.indexOf(state) <= ORDER_OF_STATES.indexOf(plan.until);
}

async function step(current: CaseRecord, name: string, input: Record<string, unknown>, actor: Actor = SALES) {
  return runStep(quoteJob, current.id, name, input, actor);
}

async function wipe() {
  const sql = getSql();
  const orders = await sql<{ ref: string }[]>`select ref from cases where job = 'order' and (data->>'fixture')::boolean is true`;
  const orderRefs = orders.map((row) => row.ref);
  if (orderRefs.length) await sql`delete from inv_commitments where order_ref = any(${orderRefs})`;
  await sql`delete from cases where job = 'order' and (data->>'fixture')::boolean is true`;
  await sql`delete from cases where job = 'quote' and (data->>'fixture')::boolean is true`;
  await sql`delete from inv_commitments where sku in (select sku from inv_items where fixture)`;
  await sql`delete from inv_items where fixture`;
  // Restart ref numbers for a job that has no cases left, so a reset demo
  // starts at Q-1001 again. Real cases keep their numbers.
  await sql`delete from case_counters where job not in (select distinct job from cases)`;
  console.log(`Removed sample data (${orderRefs.length} orders).`);
}

async function seed() {
  const sql = getSql();
  for (const [sku, name, unit, rate, hsn, onHand, local, imported] of ITEMS) {
    await sql`
      insert into inv_items (sku, name, unit, rate_paise, hsn, on_hand, incoming_local, incoming_import, fixture)
      values (${sku}, ${name}, ${unit}, ${Math.round(rate * 100)}, ${hsn}, ${onHand}, ${local}, ${imported}, true)
    `;
  }

  for (const plan of PLANS) {
    let current = await createCase(quoteJob, 'recordEnquiry', plan.buyer, SALES);
    // Tag the case before any event carries it, so the order made from it is tagged too.
    await sql`update cases set data = data || '{"fixture": true}'::jsonb where id = ${current.id}`;
    current = (await sql<CaseRecord[]>`select * from cases where id = ${current.id}`)[0];

    if (plan.lines && reached(plan, 'draft')) current = await step(current, 'draftQuote', { lines: plan.lines, pincode: plan.pincode });
    if (plan.lines && reached(plan, 'awaiting_approval')) current = await step(current, 'submitQuote', {});
    if (current.state === 'awaiting_approval' && reached(plan, 'approved')) {
      const version = (current.data as { quote: { version: number } }).quote.version;
      current = await step(current, 'approveQuote', { version }, OWNER);
    }
    if (reached(plan, 'sent') && current.state === 'approved') current = await step(current, 'markSent', { channel: plan.buyer.channel === 'email' ? 'email' : 'whatsapp' });
    if (plan.until === 'accepted') current = await step(current, 'markAccepted', { buyerPo: plan.buyerPo });
    if (plan.until === 'lost') current = await step(current, 'markLost', { reason: plan.lostReason });
    await runJobConsumers();

    if (plan.thenDispatch) {
      const [order] = await sql<CaseRecord[]>`select * from cases where parent_case_id = ${current.id} and job = 'order'`;
      if (order) {
        await runStep(orderJob, order.id, 'dispatchOrder', { vehicle: 'KA 51 AB 4412' }, userActor({ ...seedUser, name: 'Ravi (sample)' }));
        await runJobConsumers();
      }
    }

    // Spread the timeline back in time so the sample reads like real work:
    // the steps of one case sit minutes apart, and cases sit hours apart.
    await sql`
      with ordered as (
        select s.id, row_number() over (order by s.id) as n, count(*) over () as total
        from case_steps s
        join cases c on c.id = s.case_id
        where c.id = ${current.id} or c.parent_case_id = ${current.id}
      )
      update case_steps s
      set created_at = now() - make_interval(hours => ${plan.hoursAgo}) + make_interval(mins => (ordered.n - 1)::int * 47)
      from ordered where ordered.id = s.id
    `;
    await sql`
      update cases c set
        created_at = (select min(created_at) from case_steps where case_id = c.id),
        updated_at = (select max(created_at) from case_steps where case_id = c.id)
      where c.id = ${current.id} or c.parent_case_id = ${current.id}
    `;
    console.log(`${current.ref} ${plan.buyer.company}: ${quoteJob.states[current.state].label}`);
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
