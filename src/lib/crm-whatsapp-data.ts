import { getSql } from './db';
import {
  WHATSAPP_CONSENT_STATUSES,
  type WhatsAppConsentStatus,
} from './crm-types';
import {
  confirmationMessage,
  resolveWhatsAppTransition,
  whatsAppTransitionError,
  type WhatsAppWorkflowAction,
} from './crm-whatsapp-rules';

export function isWhatsAppConsentStatus(value: unknown): value is WhatsAppConsentStatus {
  return typeof value === 'string'
    && (WHATSAPP_CONSENT_STATUSES as readonly string[]).includes(value);
}

export async function configureCrmWhatsApp(input: {
  dealId: number;
  consentStatus: WhatsAppConsentStatus;
  appointmentAt: string | null;
  actor: string;
}) {
  const sql = getSql();
  await sql.begin(async (tx) => {
    const deals = await tx<{ id: number; consent_status: string | null }[]>`
      select d.id, w.consent_status
      from crm_deals d
      left join crm_whatsapp_workflows w on w.deal_id = d.id
      where d.id = ${input.dealId}
      for update of d
    `;
    if (!deals[0]) throw new Error('deal_not_found');
    // Opt-out is a one-way latch: a reconfigure can never silently clear it.
    if (deals[0].consent_status === 'opted_out' && input.consentStatus !== 'opted_out') {
      throw new Error('opted_out_locked');
    }

    const optedOut = input.consentStatus === 'opted_out';
    await tx`
      insert into crm_whatsapp_workflows (
        deal_id, state, consent_status, enabled, appointment_at, next_message_at
      )
      values (
        ${input.dealId},
        ${optedOut ? 'opted_out' : 'booked'},
        ${input.consentStatus},
        false,
        ${input.appointmentAt},
        null
      )
      on conflict (deal_id) do update set
        state = case
          when ${optedOut} then 'opted_out'
          when crm_whatsapp_workflows.state = 'opted_out' then 'booked'
          else crm_whatsapp_workflows.state
        end,
        consent_status = excluded.consent_status,
        enabled = case when ${optedOut} then false else crm_whatsapp_workflows.enabled end,
        appointment_at = excluded.appointment_at,
        next_message_at = case when ${optedOut} then null else crm_whatsapp_workflows.next_message_at end,
        updated_at = now()
    `;
    await tx`
      insert into crm_activities (deal_id, actor, type, subject, body, source)
      values (
        ${input.dealId},
        ${input.actor},
        'whatsapp_workflow',
        'WhatsApp automation configured',
        ${input.appointmentAt ? `Appointment set for ${input.appointmentAt}` : 'Appointment not set'},
        'automation'
      )
    `;
  });
}

export async function transitionCrmWhatsApp(input: {
  dealId: number;
  action: WhatsAppWorkflowAction;
  actor: string;
  handoffReason?: string;
}) {
  const sql = getSql();
  await sql.begin(async (tx) => {
    const rows = await tx<{
      contact_name: string;
      primary_phone: string | null;
      consent_status: WhatsAppConsentStatus | null;
      appointment_at: string | null;
    }[]>`
      select
        c.name as contact_name,
        c.primary_phone,
        w.consent_status,
        w.appointment_at
      from crm_deals d
      join crm_contacts c on c.id = d.contact_id
      left join crm_whatsapp_workflows w on w.deal_id = d.id
      where d.id = ${input.dealId}
      for update of d
    `;
    const current = rows[0];
    if (!current) throw new Error('deal_not_found');
    const guardError = whatsAppTransitionError(input.action, {
      consentStatus: current.consent_status,
      primaryPhone: current.primary_phone,
      appointmentAt: current.appointment_at,
    });
    if (guardError) throw new Error(guardError);

    const transition = resolveWhatsAppTransition(
      input.action,
      current.appointment_at,
    );
    const consentStatus = input.action === 'opt_out'
      ? 'opted_out'
      : current.consent_status;
    const body = input.action === 'start' && current.appointment_at
      ? confirmationMessage(current.contact_name, current.appointment_at)
      : input.handoffReason?.trim() || null;

    await tx`
      update crm_whatsapp_workflows
      set
        state = ${transition.state},
        consent_status = ${consentStatus},
        enabled = ${transition.enabled},
        next_message_at = ${transition.nextMessageAt},
        last_intent = ${input.action},
        handoff_reason = ${input.action === 'handoff' ? body : null},
        updated_at = now()
      where deal_id = ${input.dealId}
    `;
    await tx`
      insert into crm_activities (
        deal_id, actor, type, direction, subject, body, source
      )
      values (
        ${input.dealId},
        ${input.actor},
        'whatsapp_workflow',
        ${transition.direction ?? null},
        ${transition.subject},
        ${body},
        'automation'
      )
    `;
    await tx`
      update crm_deals
      set last_interaction_at = now(), updated_at = now()
      where id = ${input.dealId}
    `;
  });
}
