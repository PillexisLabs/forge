import { getSql } from '@/core/db';
import {
  classifyInboundIntent,
  inboundAck,
  type InboundIntent,
  type WhatsAppWorkflowAction,
} from './crm-whatsapp-rules';
import { transitionCrmWhatsApp } from './crm-whatsapp-data';
import { env } from '@/core/env';

const INTENT_ACTIONS: Record<InboundIntent, WhatsAppWorkflowAction> = {
  confirm: 'confirm',
  reschedule: 'reschedule',
  opt_out: 'opt_out',
  handoff: 'handoff',
};

export type InboundResult =
  | { handled: false; reason: 'duplicate' | 'no_matching_lead' }
  | { handled: true; dealId: number; intent: InboundIntent; ack: string | null };

// Processes one inbound WhatsApp message: writes it to the lead's activity
// trail (idempotently, keyed on Meta's message id), classifies the intent,
// moves the workflow, and returns the acknowledgement to send back.
export async function recordInboundWhatsApp(input: {
  from: string; // wa id: country code + number, digits only
  text: string;
  messageId: string;
  profileName?: string;
}): Promise<InboundResult> {
  const sql = getSql();

  const leads = await sql<{ deal_id: number; contact_name: string }[]>`
    select d.id as deal_id, c.name as contact_name
    from crm_contacts c
    join crm_deals d on d.contact_id = c.id
    left join crm_whatsapp_workflows w on w.deal_id = d.id
    where regexp_replace(coalesce(c.primary_phone, ''), '[^0-9]', '', 'g') = ${input.from}
    order by (w.id is not null) desc, d.updated_at desc
    limit 1
  `;
  const lead = leads[0];
  if (!lead) {
    console.warn(`inbound whatsapp from ${input.from}: no matching lead`);
    return { handled: false, reason: 'no_matching_lead' };
  }

  const inserted = await sql`
    insert into crm_activities (deal_id, actor, type, direction, subject, body, source, source_id)
    values (
      ${lead.deal_id},
      ${input.profileName ?? lead.contact_name},
      'whatsapp', 'inbound',
      'Client replied on WhatsApp',
      ${input.text},
      'automation',
      ${`wa-in-${input.messageId}`}
    )
    on conflict (source, source_id) where source_id is not null and source_id <> '' do nothing
    returning id
  `;
  if (!inserted.length) return { handled: false, reason: 'duplicate' };

  const intent = classifyInboundIntent(input.text);
  try {
    await transitionCrmWhatsApp({
      dealId: lead.deal_id,
      action: INTENT_ACTIONS[intent],
      actor: 'system',
      handoffReason: intent === 'handoff' ? `Free-form reply: "${input.text.slice(0, 120)}"` : undefined,
    });
  } catch (error) {
    // Guard rejections (e.g. a reply after opt-out) still keep the inbound
    // message on record; they just don't move the state.
    const code = error instanceof Error ? error.message : 'unknown';
    console.warn(`inbound whatsapp deal ${lead.deal_id}: transition ${intent} blocked (${code})`);
    return { handled: true, dealId: lead.deal_id, intent, ack: null };
  }

  return {
    handled: true,
    dealId: lead.deal_id,
    intent,
    ack: inboundAck(intent, lead.contact_name, env.whatsappRescheduleLink()),
  };
}

// Delivery failures from Meta's status callbacks — this is how a silently
// dropped message becomes visible on the lead's record.
export async function recordDeliveryFailure(input: {
  messageId: string;
  recipient: string;
  detail: string;
}) {
  const sql = getSql();
  await sql`
    insert into crm_activities (deal_id, actor, type, subject, body, source, source_id)
    select a.deal_id, 'system', 'whatsapp_error', 'WhatsApp delivery failed', ${input.detail}, 'automation', ${`wa-fail-${input.messageId}`}
    from crm_activities a
    where a.source_id = ${input.messageId}
    limit 1
    on conflict (source, source_id) where source_id is not null and source_id <> '' do nothing
  `;
}
