import { getSql } from './db';
import type { CrmActivity, CrmDeal, CrmOwner, CrmStage, CrmWorkspace } from './crm-types';
import { CRM_OWNERS, CRM_STAGES } from './crm-types';

type DealRow = Omit<CrmDeal, 'activities' | 'estimated_value' | 'whatsapp'> & {
  estimated_value: string | number | null;
  whatsapp_workflow_id: number | null;
  whatsapp_state: CrmDeal['whatsapp'] extends infer Workflow
    ? Workflow extends { state: infer State }
      ? State | null
      : never
    : never;
  whatsapp_consent_status: CrmDeal['whatsapp'] extends infer Workflow
    ? Workflow extends { consent_status: infer Consent }
      ? Consent | null
      : never
    : never;
  whatsapp_enabled: boolean | null;
  whatsapp_appointment_at: string | null;
  whatsapp_next_message_at: string | null;
  whatsapp_last_intent: string | null;
  whatsapp_handoff_reason: string | null;
  whatsapp_updated_at: string | null;
};

export async function getCrmWorkspace(): Promise<CrmWorkspace> {
  const sql = getSql();
  const [dealRows, activityRows] = await Promise.all([
    sql<DealRow[]>`
      select
        d.id, d.title, d.problem_statement, d.lead_source, d.stage, d.owner,
        d.estimated_value, d.last_interaction_at, d.next_action, d.next_action_due_at,
        c.id as contact_id, c.name as contact_name, c.primary_email, c.primary_phone,
        co.id as company_id, co.display_name as company_name, co.domain as company_domain,
        count(m.id)::int as meeting_count,
        (array_agg(m.short_summary order by m.meeting_at desc) filter (where m.short_summary is not null))[1] as latest_meeting_summary,
        (array_agg(m.transcript_url order by m.meeting_at desc) filter (where m.transcript_url is not null))[1] as latest_meeting_url,
        w.id as whatsapp_workflow_id,
        w.state as whatsapp_state,
        w.consent_status as whatsapp_consent_status,
        w.enabled as whatsapp_enabled,
        w.appointment_at as whatsapp_appointment_at,
        w.next_message_at as whatsapp_next_message_at,
        w.last_intent as whatsapp_last_intent,
        w.handoff_reason as whatsapp_handoff_reason,
        w.updated_at as whatsapp_updated_at
      from crm_deals d
      join crm_contacts c on c.id = d.contact_id
      left join crm_companies co on co.id = d.company_id
      left join crm_meetings m on m.deal_id = d.id
      left join crm_whatsapp_workflows w on w.deal_id = d.id
      group by d.id, c.id, co.id, w.id
      order by
        case when d.next_action_due_at is null then 1 else 0 end,
        d.next_action_due_at asc nulls last,
        d.updated_at desc
    `,
    sql<CrmActivity[]>`
      select id, deal_id, actor, type, direction, occurred_at, subject, body, source
      from crm_activities
      order by occurred_at desc
    `,
  ]);

  const activityMap = new Map<number, CrmActivity[]>();
  for (const activity of activityRows) {
    const list = activityMap.get(activity.deal_id) ?? [];
    if (list.length < 20) list.push(activity);
    activityMap.set(activity.deal_id, list);
  }

  return {
    deals: dealRows.map((row) => {
      const {
        whatsapp_workflow_id: workflowId,
        whatsapp_state: state,
        whatsapp_consent_status: consentStatus,
        whatsapp_enabled: enabled,
        whatsapp_appointment_at: appointmentAt,
        whatsapp_next_message_at: nextMessageAt,
        whatsapp_last_intent: lastIntent,
        whatsapp_handoff_reason: handoffReason,
        whatsapp_updated_at: workflowUpdatedAt,
        ...deal
      } = row;

      return {
        ...deal,
        estimated_value: row.estimated_value == null ? null : Number(row.estimated_value),
        whatsapp: workflowId && state && consentStatus && workflowUpdatedAt
          ? {
              id: workflowId,
              state,
              consent_status: consentStatus,
              enabled: Boolean(enabled),
              appointment_at: appointmentAt,
              next_message_at: nextMessageAt,
              last_intent: lastIntent,
              handoff_reason: handoffReason,
              updated_at: workflowUpdatedAt,
            }
          : null,
        activities: activityMap.get(row.id) ?? [],
      };
    }),
    generatedAt: new Date().toISOString(),
  };
}

export function isCrmStage(value: unknown): value is CrmStage {
  return typeof value === 'string' && (CRM_STAGES as readonly string[]).includes(value);
}

export function isCrmOwner(value: unknown): value is CrmOwner {
  return typeof value === 'string' && (CRM_OWNERS as readonly string[]).includes(value);
}

export async function updateCrmDeal(input: {
  id: number;
  owner?: CrmOwner;
  stage?: CrmStage;
  nextAction?: string | null;
  nextActionDueAt?: string | null;
  primaryPhone?: string | null;
  actor: string;
}) {
  const sql = getSql();
  return sql.begin(async (tx) => {
    const current = await tx<{
      owner: CrmOwner;
      stage: CrmStage;
      next_action: string | null;
      next_action_due_at: string | null;
      contact_id: number;
      primary_phone: string | null;
    }[]>`
      select d.owner, d.stage, d.next_action, d.next_action_due_at, d.contact_id, c.primary_phone
      from crm_deals d
      join crm_contacts c on c.id = d.contact_id
      where d.id = ${input.id}
      for update of d, c
    `;
    if (!current[0]) throw new Error('deal_not_found');

    const owner = input.owner ?? current[0].owner;
    const stage = input.stage ?? current[0].stage;
    const nextAction = input.nextAction === undefined ? current[0].next_action : input.nextAction;
    const nextActionDueAt = input.nextActionDueAt === undefined ? current[0].next_action_due_at : input.nextActionDueAt;
    const primaryPhone = input.primaryPhone === undefined ? current[0].primary_phone : input.primaryPhone;

    await tx`
      update crm_deals
      set owner = ${owner}, stage = ${stage}, next_action = ${nextAction},
          next_action_due_at = ${nextActionDueAt}, updated_at = now()
      where id = ${input.id}
    `;
    if (primaryPhone !== current[0].primary_phone) {
      await tx`
        update crm_contacts
        set primary_phone = ${primaryPhone}, updated_at = now()
        where id = ${current[0].contact_id}
      `;
      await tx`
        insert into crm_activities (deal_id, actor, type, subject)
        values (${input.id}, ${input.actor}, 'contact_change', 'WhatsApp phone updated')
      `;
    }

    if (owner !== current[0].owner) {
      await tx`insert into crm_activities (deal_id, actor, type, subject) values (${input.id}, ${input.actor}, 'owner_change', ${`Owner changed to ${owner}`})`;
    }
    if (stage !== current[0].stage) {
      await tx`insert into crm_activities (deal_id, actor, type, subject) values (${input.id}, ${input.actor}, 'stage_change', ${`Stage changed to ${stage}`})`;
    }
    if (nextAction !== current[0].next_action || nextActionDueAt !== current[0].next_action_due_at) {
      await tx`insert into crm_activities (deal_id, actor, type, subject, body) values (${input.id}, ${input.actor}, 'next_action', 'Next action updated', ${nextAction})`;
    }
  });
}

export async function addCrmActivity(input: {
  dealId: number;
  actor: string;
  type: string;
  direction?: 'inbound' | 'outbound';
  subject: string;
  body?: string;
}) {
  const sql = getSql();
  await sql.begin(async (tx) => {
    await tx`
      insert into crm_activities (deal_id, actor, type, direction, subject, body)
      values (${input.dealId}, ${input.actor}, ${input.type}, ${input.direction ?? null}, ${input.subject}, ${input.body ?? null})
    `;
    await tx`update crm_deals set last_interaction_at = now(), updated_at = now() where id = ${input.dealId}`;
  });
}
