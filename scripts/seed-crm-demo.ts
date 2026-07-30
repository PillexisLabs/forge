// Seeds the CRM with deterministic demo data for client demos and local testing.
//
//   npm run crm:seed-demo            # wipe previous demo rows, insert fresh set
//   npm run crm:seed-demo -- --wipe  # remove demo rows only
//
// Every row is tagged (deals: lead_source='demo', contacts/companies: notes='demo-fixture')
// so the script only ever deletes its own data. Real imported deals are never touched.
// Timestamps are relative to now(), so appointments and reminders always look current.
//
// Covers the WhatsApp MVP PRD journeys end to end: happy path (confirm → reminder →
// attended), recovery (question → reschedule), no response → nurture, plus handoff,
// opt-out, no-show, paused, ready-to-queue, and the consent-unknown gate. States the
// app cannot reach yet (nurture, no_show, attending) are inserted directly so the
// full state model is visible in the dashboard.

import { getSql } from '../src/lib/db';
import type { CrmOwner, CrmStage, WhatsAppConsentStatus, WhatsAppWorkflowState } from '../src/lib/crm-types';

const DEMO_SOURCE = 'demo';
const DEMO_NOTE = 'demo-fixture';

type DemoActivity = {
  minutesFromNow: number;
  actor: string;
  type: string;
  direction?: 'inbound' | 'outbound';
  subject: string;
  body?: string;
};

type DemoMeeting = {
  transcriptId: string;
  title: string;
  minutesFromNow: number;
  durationMinutes: number;
  shortSummary: string;
};

type DemoWorkflow = {
  state: WhatsAppWorkflowState;
  consent: WhatsAppConsentStatus;
  enabled: boolean;
  appointmentMinutesFromNow?: number;
  nextMessageMinutesFromNow?: number;
  lastIntent?: string;
  handoffReason?: string;
};

type DemoDeal = {
  company: string;
  domain: string;
  contact: string;
  email: string;
  phone?: string;
  title: string;
  problem: string;
  stage: CrmStage;
  owner: CrmOwner;
  estimatedValue?: number;
  nextAction?: string;
  nextActionMinutesFromNow?: number;
  lostReason?: string;
  workflow?: DemoWorkflow;
  meetings?: DemoMeeting[];
  activities: DemoActivity[];
};

const MIN = 1;
const HOUR = 60;
const DAY = 24 * HOUR;

const DEALS: DemoDeal[] = [
  {
    company: 'Aarohi Naturals',
    domain: 'aarohinaturals.demo.test',
    contact: 'Riya Sharma',
    email: 'riya@aarohinaturals.demo.test',
    phone: '+91 90000 00011',
    title: 'Aarohi Naturals — AI Stack Audit',
    problem: 'Ayurvedic skincare D2C running support and ops on six disconnected tools.',
    stage: 'intro_call_booked',
    owner: 'anurag',
    estimatedValue: 150000,
    nextAction: 'Run the intro call',
    nextActionMinutesFromNow: 26 * HOUR,
    workflow: {
      state: 'confirmed',
      consent: 'granted',
      enabled: true,
      appointmentMinutesFromNow: 26 * HOUR,
      nextMessageMinutesFromNow: 2 * HOUR, // 24h-before reminder
      lastIntent: 'confirm',
    },
    activities: [
      { minutesFromNow: -22 * HOUR, actor: 'system', type: 'whatsapp_workflow', direction: 'outbound', subject: 'WhatsApp confirmation queued', body: 'Hi Riya, this is Anurag from Pillexis Labs. Your call is booked. Please reply confirm to keep the slot, or reschedule if you need another time.' },
      { minutesFromNow: -21 * HOUR, actor: 'system', type: 'whatsapp', direction: 'inbound', subject: 'Client replied on WhatsApp', body: 'Confirm. Looking forward to it.' },
      { minutesFromNow: -21 * HOUR + 1, actor: 'system', type: 'whatsapp_workflow', direction: 'inbound', subject: 'Client confirmed the call' },
    ],
  },
  {
    company: 'TrailBite Foods',
    domain: 'trailbite.demo.test',
    contact: 'Karan Mehta',
    email: 'karan@trailbite.demo.test',
    phone: '+91 90000 00012',
    title: 'TrailBite Foods — Ops Automation',
    problem: 'Healthy snacking brand drowning in manual order reconciliation across Shopify and marketplaces.',
    stage: 'intro_call_booked',
    owner: 'priyanka',
    estimatedValue: 300000,
    nextAction: 'Watch for WhatsApp confirmation',
    nextActionMinutesFromNow: 4 * HOUR,
    workflow: {
      state: 'awaiting_confirmation',
      consent: 'granted',
      enabled: true,
      appointmentMinutesFromNow: 3 * DAY,
      nextMessageMinutesFromNow: 20 * HOUR, // confirmation nudge if silent
      lastIntent: 'start',
    },
    activities: [
      { minutesFromNow: -3 * HOUR, actor: 'system', type: 'whatsapp_workflow', direction: 'outbound', subject: 'WhatsApp confirmation queued', body: 'Hi Karan, this is Anurag from Pillexis Labs. Your call is booked. Please reply confirm to keep the slot, or reschedule if you need another time.' },
    ],
  },
  {
    company: 'Velluto Home',
    domain: 'vellutohome.demo.test',
    contact: 'Sana Iqbal',
    email: 'sana@vellutohome.demo.test',
    phone: '+91 90000 00013',
    title: 'Velluto Home — AI Stack Audit',
    problem: 'Premium home decor brand with three AI subscriptions nobody uses consistently.',
    stage: 'discovery_proposed',
    owner: 'anurag',
    estimatedValue: 150000,
    nextAction: 'Send the discovery proposal',
    nextActionMinutesFromNow: -1 * DAY, // overdue on purpose for the Today view
    workflow: {
      state: 'attended',
      consent: 'granted',
      enabled: false,
      appointmentMinutesFromNow: -2 * DAY,
      lastIntent: 'attended',
    },
    meetings: [
      {
        transcriptId: 'demo-ff-001',
        title: 'Pillexis Labs intro call — Velluto Home',
        minutesFromNow: -2 * DAY,
        durationMinutes: 24,
        shortSummary: 'Sana walked through the current AI tool sprawl. Main pain: product descriptions and support macros are written three times in three tools. Wants a single audited stack. Open to a 14-day audit starting next month.',
      },
    ],
    activities: [
      { minutesFromNow: -3 * DAY, actor: 'system', type: 'whatsapp_workflow', direction: 'outbound', subject: 'WhatsApp confirmation queued', body: 'Hi Sana, this is Anurag from Pillexis Labs. Your call is booked. Please reply confirm to keep the slot, or reschedule if you need another time.' },
      { minutesFromNow: -3 * DAY + 40, actor: 'system', type: 'whatsapp', direction: 'inbound', subject: 'Client replied on WhatsApp', body: 'Confirmed, see you then.' },
      { minutesFromNow: -2 * DAY - 2 * HOUR, actor: 'system', type: 'whatsapp', direction: 'outbound', subject: 'Reminder sent', body: 'Hi Sana, quick reminder that your Pillexis Labs call starts in 2 hours. Reply here if anything changes.' },
      { minutesFromNow: -2 * DAY + 30, actor: 'anurag', type: 'whatsapp_workflow', subject: 'Call marked as attended' },
      { minutesFromNow: -2 * DAY + 45, actor: 'anurag', type: 'note', subject: 'Call notes', body: 'Strong fit for the audit sprint. Decision maker. Wants the proposal before Friday.' },
    ],
  },
  {
    company: 'Kubo Kids',
    domain: 'kubokids.demo.test',
    contact: 'Ananya Rao',
    email: 'ananya@kubokids.demo.test',
    phone: '+91 90000 00014',
    title: 'Kubo Kids — Ops Automation',
    problem: 'Kidswear brand with WISMO tickets eating 4 hours of founder time daily.',
    stage: 'contacted',
    owner: 'priyanka',
    estimatedValue: 300000,
    nextAction: 'Confirm the new slot after reschedule',
    nextActionMinutesFromNow: 0, // due today
    workflow: {
      state: 'rescheduled',
      consent: 'granted',
      enabled: false,
      appointmentMinutesFromNow: 5 * DAY,
      lastIntent: 'reschedule',
    },
    activities: [
      { minutesFromNow: -2 * DAY, actor: 'system', type: 'whatsapp_workflow', direction: 'outbound', subject: 'WhatsApp confirmation queued', body: 'Hi Ananya, this is Anurag from Pillexis Labs. Your call is booked. Please reply confirm to keep the slot, or reschedule if you need another time.' },
      { minutesFromNow: -2 * DAY + 3 * HOUR, actor: 'system', type: 'whatsapp', direction: 'inbound', subject: 'Client replied on WhatsApp', body: 'That slot clashes with our warehouse audit. Can we do early next week instead?' },
      { minutesFromNow: -2 * DAY + 3 * HOUR + 5, actor: 'system', type: 'whatsapp', direction: 'outbound', subject: 'Reschedule link sent', body: 'No problem Ananya, here is the calendar link to pick a slot that works: cal.com/pillexislabs (demo).' },
      { minutesFromNow: -2 * DAY + 3 * HOUR + 6, actor: 'system', type: 'whatsapp_workflow', direction: 'inbound', subject: 'Client requested a reschedule' },
    ],
  },
  {
    company: 'Sundara Ayurveda',
    domain: 'sundara.demo.test',
    contact: 'Vikram Nair',
    email: 'vikram@sundara.demo.test',
    phone: '+91 90000 00015',
    title: 'Sundara Ayurveda — AI Stack Audit',
    problem: 'Wellness brand exploring AI for catalogue and support, unclear budget.',
    stage: 'nurture',
    owner: 'anurag',
    workflow: {
      state: 'nurture',
      consent: 'granted',
      enabled: false,
      appointmentMinutesFromNow: -4 * DAY,
      lastIntent: 'start',
    },
    activities: [
      { minutesFromNow: -6 * DAY, actor: 'system', type: 'whatsapp_workflow', direction: 'outbound', subject: 'WhatsApp confirmation queued', body: 'Hi Vikram, this is Anurag from Pillexis Labs. Your call is booked. Please reply confirm to keep the slot, or reschedule if you need another time.' },
      { minutesFromNow: -5 * DAY, actor: 'system', type: 'whatsapp', direction: 'outbound', subject: 'Confirmation reminder sent', body: 'Hi Vikram, just checking you saw the booking for your Pillexis Labs call. Reply confirm to keep the slot.' },
      { minutesFromNow: -4 * DAY, actor: 'system', type: 'whatsapp', direction: 'outbound', subject: 'Nurture message 1 of 2 sent', body: 'Sharing a 3-minute read on what an AI stack audit found for a skincare brand your size. No reply needed.' },
      { minutesFromNow: -4 * DAY + 1, actor: 'system', type: 'whatsapp_workflow', subject: 'Moved to nurture after two unanswered confirmations' },
    ],
  },
  {
    company: 'NimbusWear',
    domain: 'nimbuswear.demo.test',
    contact: 'Devika Kulkarni',
    email: 'devika@nimbuswear.demo.test',
    phone: '+91 90000 00016',
    title: 'NimbusWear — Ops Automation',
    problem: 'Athleisure brand asking for custom scope across two warehouses.',
    stage: 'qualified',
    owner: 'anurag',
    estimatedValue: 450000,
    nextAction: 'Reply to the pricing question personally',
    nextActionMinutesFromNow: 2 * HOUR,
    workflow: {
      state: 'human_handoff',
      consent: 'granted',
      enabled: false,
      appointmentMinutesFromNow: 2 * DAY,
      lastIntent: 'handoff',
      handoffReason: 'Asked for custom pricing across two warehouses — outside the approved FAQ set.',
    },
    activities: [
      { minutesFromNow: -1 * DAY, actor: 'system', type: 'whatsapp_workflow', direction: 'outbound', subject: 'WhatsApp confirmation queued', body: 'Hi Devika, this is Anurag from Pillexis Labs. Your call is booked. Please reply confirm to keep the slot, or reschedule if you need another time.' },
      { minutesFromNow: -1 * DAY + 2 * HOUR, actor: 'system', type: 'whatsapp', direction: 'inbound', subject: 'Client replied on WhatsApp', body: 'Before the call — what would this cost for two warehouses with separate WMS setups?' },
      { minutesFromNow: -1 * DAY + 2 * HOUR + 1, actor: 'system', type: 'whatsapp_workflow', subject: 'WhatsApp conversation needs a founder', body: 'Asked for custom pricing across two warehouses — outside the approved FAQ set.' },
    ],
  },
  {
    company: 'Zesty Bowl',
    domain: 'zestybowl.demo.test',
    contact: 'Ajay Verma',
    email: 'ajay@zestybowl.demo.test',
    phone: '+91 90000 00017',
    title: 'Zesty Bowl — AI Stack Audit',
    problem: 'Meal-kit brand, booked from the Meta ad, went quiet.',
    stage: 'lost',
    owner: 'priyanka',
    lostReason: 'Opted out of contact after booking.',
    workflow: {
      state: 'opted_out',
      consent: 'opted_out',
      enabled: false,
      appointmentMinutesFromNow: -1 * DAY,
      lastIntent: 'opt_out',
    },
    activities: [
      { minutesFromNow: -3 * DAY, actor: 'system', type: 'whatsapp_workflow', direction: 'outbound', subject: 'WhatsApp confirmation queued', body: 'Hi Ajay, this is Anurag from Pillexis Labs. Your call is booked. Please reply confirm to keep the slot, or reschedule if you need another time.' },
      { minutesFromNow: -3 * DAY + HOUR, actor: 'system', type: 'whatsapp', direction: 'inbound', subject: 'Client replied on WhatsApp', body: 'STOP' },
      { minutesFromNow: -3 * DAY + HOUR + 1, actor: 'system', type: 'whatsapp_workflow', direction: 'inbound', subject: 'Client opted out of WhatsApp messages' },
    ],
  },
  {
    company: 'Mira Casa',
    domain: 'miracasa.demo.test',
    contact: 'Rohit Bansal',
    email: 'rohit@miracasa.demo.test',
    phone: '+91 90000 00018',
    title: 'Mira Casa — AI Stack Audit',
    problem: 'Furniture D2C, confirmed the call but never joined.',
    stage: 'intro_call_booked',
    owner: 'anurag',
    nextAction: 'Send the no-show recovery message',
    nextActionMinutesFromNow: 5 * HOUR,
    workflow: {
      state: 'no_show',
      consent: 'granted',
      enabled: false,
      appointmentMinutesFromNow: -1 * DAY,
      lastIntent: 'confirm',
    },
    activities: [
      { minutesFromNow: -2 * DAY, actor: 'system', type: 'whatsapp_workflow', direction: 'outbound', subject: 'WhatsApp confirmation queued', body: 'Hi Rohit, this is Anurag from Pillexis Labs. Your call is booked. Please reply confirm to keep the slot, or reschedule if you need another time.' },
      { minutesFromNow: -2 * DAY + 30, actor: 'system', type: 'whatsapp', direction: 'inbound', subject: 'Client replied on WhatsApp', body: 'confirm' },
      { minutesFromNow: -1 * DAY + HOUR, actor: 'anurag', type: 'note', subject: 'Marked as no-show', body: 'Waited 10 minutes on the call. No message from Rohit.' },
    ],
  },
  {
    company: 'Petal & Pine',
    domain: 'petalpine.demo.test',
    contact: 'Ishita Desai',
    email: 'ishita@petalpine.demo.test',
    phone: '+91 90000 00019',
    title: 'Petal & Pine — Ops Automation',
    problem: 'Gifting brand mid-negotiation, asked us to hold messages until their sale week ends.',
    stage: 'discovery_won',
    owner: 'priyanka',
    estimatedValue: 300000,
    nextAction: 'Resume automation after sale week',
    nextActionMinutesFromNow: 6 * DAY,
    workflow: {
      state: 'paused',
      consent: 'granted',
      enabled: false,
      appointmentMinutesFromNow: 8 * DAY,
      lastIntent: 'pause',
    },
    activities: [
      { minutesFromNow: -2 * DAY, actor: 'priyanka', type: 'whatsapp_workflow', subject: 'WhatsApp automation paused', body: 'Client asked for no messages during their sale week.' },
    ],
  },
  {
    company: 'Bolt Nutrition',
    domain: 'boltnutrition.demo.test',
    contact: 'Arjun Khanna',
    email: 'arjun@boltnutrition.demo.test',
    phone: '+91 90000 00020',
    title: 'Bolt Nutrition — AI Stack Audit',
    problem: 'Supplements brand, fresh booking from the Meta lead form.',
    stage: 'intro_call_booked',
    owner: 'anurag',
    nextAction: 'Queue the WhatsApp confirmation',
    nextActionMinutesFromNow: HOUR,
    workflow: {
      state: 'booked',
      consent: 'granted',
      enabled: false,
      appointmentMinutesFromNow: 4 * DAY,
    },
    activities: [
      { minutesFromNow: -2 * HOUR, actor: 'system', type: 'note', subject: 'Booking received', body: 'Booked via the Meta ad lead form. Qualification: ₹2Cr ARR, 4-person ops team.' },
    ],
  },
  {
    company: 'Handloom House',
    domain: 'handloomhouse.demo.test',
    contact: 'Meera Pillai',
    email: 'meera@handloomhouse.demo.test',
    phone: '+91 90000 00021',
    title: 'Handloom House — AI Stack Audit',
    problem: 'Heritage textiles brand, booked through a referral. Consent not recorded yet.',
    stage: 'new_lead',
    owner: 'unassigned',
    nextAction: 'Record WhatsApp consent before queueing',
    nextActionMinutesFromNow: 3 * HOUR,
    workflow: {
      state: 'booked',
      consent: 'unknown',
      enabled: false,
      appointmentMinutesFromNow: 2 * DAY,
    },
    activities: [
      { minutesFromNow: -1 * HOUR, actor: 'anurag', type: 'note', subject: 'Referral booking', body: 'Came in via a Productlogz customer intro. No consent on record yet, so automation stays blocked.' },
    ],
  },
  {
    company: 'UrbanRoots',
    domain: 'urbanroots.demo.test',
    contact: 'Nikhil Joshi',
    email: 'nikhil@urbanroots.demo.test',
    phone: '+91 90000 00022',
    title: 'UrbanRoots — Ops Automation',
    problem: 'Indoor plants D2C. Call starts in a few hours; reminder sequence live.',
    stage: 'intro_call_booked',
    owner: 'priyanka',
    estimatedValue: 300000,
    nextAction: 'Join the call',
    nextActionMinutesFromNow: 5 * HOUR,
    workflow: {
      state: 'attending',
      consent: 'granted',
      enabled: true,
      appointmentMinutesFromNow: 5 * HOUR,
      nextMessageMinutesFromNow: 3 * HOUR, // 2h-before attendance check
      lastIntent: 'confirm',
    },
    activities: [
      { minutesFromNow: -1 * DAY, actor: 'system', type: 'whatsapp_workflow', direction: 'outbound', subject: 'WhatsApp confirmation queued', body: 'Hi Nikhil, this is Anurag from Pillexis Labs. Your call is booked. Please reply confirm to keep the slot, or reschedule if you need another time.' },
      { minutesFromNow: -1 * DAY + 15, actor: 'system', type: 'whatsapp', direction: 'inbound', subject: 'Client replied on WhatsApp', body: 'Confirmed 👍' },
      { minutesFromNow: -19 * HOUR, actor: 'system', type: 'whatsapp', direction: 'outbound', subject: '24 hour reminder sent', body: 'Hi Nikhil, reminder that your Pillexis Labs call is tomorrow. Reply here if anything changes.' },
    ],
  },
  {
    company: 'Clay & Co',
    domain: 'clayandco.demo.test',
    contact: 'Farah Ansari',
    email: 'farah@clayandco.demo.test',
    title: 'Clay & Co — AI Stack Audit',
    problem: 'Ceramics brand, filled the readiness quiz, no call booked yet.',
    stage: 'new_lead',
    owner: 'unassigned',
    activities: [
      { minutesFromNow: -4 * HOUR, actor: 'system', type: 'note', subject: 'Lead captured', body: 'Completed the AI Build Readiness quiz with a score of 62.' },
    ],
  },
  {
    company: 'Fable Threads',
    domain: 'fablethreads.demo.test',
    contact: 'Siddharth Menon',
    email: 'sid@fablethreads.demo.test',
    phone: '+91 90000 00023',
    title: 'Fable Threads — Ops Automation',
    problem: 'Fashion label, first email exchange done, pushing for a call.',
    stage: 'contacted',
    owner: 'anurag',
    nextAction: 'Follow up with the booking link',
    nextActionMinutesFromNow: DAY,
    activities: [
      { minutesFromNow: -2 * DAY, actor: 'anurag', type: 'email', direction: 'outbound', subject: 'Intro email sent', body: 'Shared the two-sprint overview and the booking link.' },
    ],
  },
  {
    company: 'GreenGlow',
    domain: 'greenglow.demo.test',
    contact: 'Tanvi Shah',
    email: 'tanvi@greenglow.demo.test',
    phone: '+91 90000 00024',
    title: 'GreenGlow — Ops Automation',
    problem: 'Clean beauty brand. Closed: 30-day ops automation sprint.',
    stage: 'won',
    owner: 'anurag',
    estimatedValue: 300000,
    activities: [
      { minutesFromNow: -10 * DAY, actor: 'anurag', type: 'stage_change', subject: 'Stage changed to won', body: 'Signed the 30-day Ops Automation sprint.' },
    ],
  },
];

function parseDbHost(url: string) {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

async function main() {
  const wipeOnly = process.argv.includes('--wipe');
  const allowRemote = process.argv.includes('--allow-remote');

  const host = parseDbHost(process.env.DATABASE_URL ?? '');
  const isLocal = host === 'localhost' || host === '127.0.0.1';
  if (!isLocal && !allowRemote) {
    console.error(`DATABASE_URL points at "${host || 'unknown host'}", not localhost.`);
    console.error('Re-run with --allow-remote to seed a remote (e.g. staging) database on purpose.');
    process.exit(1);
  }

  const sql = getSql();
  try {
    await sql.begin(async (tx) => {
      // Remove only rows this script owns. Deals cascade to activities,
      // meetings, tasks, and workflows. Contacts are restricted by deals,
      // so deals go first.
      const deletedDeals = await tx`delete from crm_deals where lead_source = ${DEMO_SOURCE} returning id`;
      const deletedContacts = await tx`delete from crm_contacts where notes = ${DEMO_NOTE} returning id`;
      const deletedCompanies = await tx`delete from crm_companies where notes = ${DEMO_NOTE} returning id`;
      console.log(`Wiped ${deletedDeals.length} demo deals, ${deletedContacts.length} contacts, ${deletedCompanies.length} companies.`);
      if (wipeOnly) return;

      for (const deal of DEALS) {
        const [company] = await tx<{ id: number }[]>`
          insert into crm_companies (display_name, domain, website_url, notes)
          values (${deal.company}, ${deal.domain}, ${`https://${deal.domain}`}, ${DEMO_NOTE})
          returning id
        `;
        const [contact] = await tx<{ id: number }[]>`
          insert into crm_contacts (company_id, name, primary_email, primary_phone, notes)
          values (${company.id}, ${deal.contact}, ${deal.email}, ${deal.phone ?? null}, ${DEMO_NOTE})
          returning id
        `;

        const lastInteraction = deal.activities.length
          ? Math.max(...deal.activities.map((a) => a.minutesFromNow))
          : null;
        const [dealRow] = await tx<{ id: number }[]>`
          insert into crm_deals (
            contact_id, company_id, title, problem_statement, lead_source, source_detail,
            stage, owner, estimated_value, last_interaction_at, next_action, next_action_due_at, lost_reason
          ) values (
            ${contact.id}, ${company.id}, ${deal.title}, ${deal.problem}, ${DEMO_SOURCE}, 'Seeded demo data',
            ${deal.stage}, ${deal.owner}, ${deal.estimatedValue ?? null},
            ${lastInteraction === null ? null : tx`now() + ${lastInteraction} * interval '1 minute'`},
            ${deal.nextAction ?? null},
            ${deal.nextActionMinutesFromNow === undefined ? null : tx`now() + ${deal.nextActionMinutesFromNow} * interval '1 minute'`},
            ${deal.lostReason ?? null}
          )
          returning id
        `;

        if (deal.workflow) {
          const w = deal.workflow;
          await tx`
            insert into crm_whatsapp_workflows (
              deal_id, state, consent_status, enabled, appointment_at, next_message_at, last_intent, handoff_reason
            ) values (
              ${dealRow.id}, ${w.state}, ${w.consent}, ${w.enabled},
              ${w.appointmentMinutesFromNow === undefined ? null : tx`now() + ${w.appointmentMinutesFromNow} * interval '1 minute'`},
              ${w.nextMessageMinutesFromNow === undefined ? null : tx`now() + ${w.nextMessageMinutesFromNow} * interval '1 minute'`},
              ${w.lastIntent ?? null}, ${w.handoffReason ?? null}
            )
          `;
        }

        for (const meeting of deal.meetings ?? []) {
          await tx`
            insert into crm_meetings (
              deal_id, fireflies_transcript_id, title, meeting_at, duration_minutes,
              transcript_url, summary_status, short_summary
            ) values (
              ${dealRow.id}, ${meeting.transcriptId}, ${meeting.title},
              now() + ${meeting.minutesFromNow} * interval '1 minute',
              ${meeting.durationMinutes}, ${`https://app.fireflies.ai/view/${meeting.transcriptId}`},
              'available', ${meeting.shortSummary}
            )
          `;
        }

        for (const activity of deal.activities) {
          await tx`
            insert into crm_activities (deal_id, actor, type, direction, occurred_at, subject, body, source)
            values (
              ${dealRow.id}, ${activity.actor}, ${activity.type}, ${activity.direction ?? null},
              now() + ${activity.minutesFromNow} * interval '1 minute',
              ${activity.subject}, ${activity.body ?? null}, ${DEMO_SOURCE}
            )
          `;
        }
      }
      console.log(`Seeded ${DEALS.length} demo deals (${DEALS.filter((d) => d.workflow).length} with WhatsApp workflows).`);
    });
  } finally {
    await sql.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
