import { getSql } from '@/core/db';
import { env } from '@/core/env';
import { resolveDueSend } from './crm-whatsapp-rules';
import { sendWhatsAppTemplate, sendWhatsAppText } from './whatsapp-provider';

const RETRY_DELAY_MINUTES = 10;

// One worker pass: find due, consented, enabled workflow rows; send what each
// one is owed; advance the queue. Row locks make concurrent passes safe.
export async function processDueRows(): Promise<number> {
  const sql = getSql();
  const due = await sql<{ deal_id: number }[]>`
    select w.deal_id
    from crm_whatsapp_workflows w
    where w.enabled = true
      and w.consent_status = 'granted'
      and w.next_message_at is not null
      and w.next_message_at <= now()
    order by w.next_message_at asc
    limit 20
  `;

  let sent = 0;
  for (const row of due) {
    await sql.begin(async (tx) => {
      // Re-check under lock so two workers can't double-send.
      const rows = await tx<{
        state: string;
        contact_name: string;
        primary_phone: string | null;
        appointment_at: string | null;
        send_count: string;
      }[]>`
        select
          w.state,
          c.name as contact_name,
          c.primary_phone,
          w.appointment_at,
          (
            select count(*) from crm_activities a
            where a.deal_id = w.deal_id and a.source = 'automation'
              and a.direction = 'outbound' and a.type = 'whatsapp'
          ) as send_count
        from crm_whatsapp_workflows w
        join crm_deals d on d.id = w.deal_id
        join crm_contacts c on c.id = d.contact_id
        where w.deal_id = ${row.deal_id}
          and w.enabled = true
          and w.consent_status = 'granted'
          and w.next_message_at is not null
          and w.next_message_at <= now()
        for update of w skip locked
      `;
      const current = rows[0];
      if (!current) return;

      const plan = resolveDueSend({
        state: current.state as Parameters<typeof resolveDueSend>[0]['state'],
        contactName: current.contact_name,
        appointmentAt: current.appointment_at,
        sendCount: Number(current.send_count),
        rescheduleLink: env.whatsappRescheduleLink(),
      });

      if (!plan || !current.primary_phone) {
        // Nothing to send from this state (or no phone): clear the stale entry.
        await tx`
          update crm_whatsapp_workflows
          set next_message_at = null, updated_at = now()
          where deal_id = ${row.deal_id}
        `;
        console.log(`whatsapp worker deal ${row.deal_id}: stale queue entry cleared (state=${current.state})`);
        return;
      }

      // Queue sends are business-initiated, so production (templates on) must
      // use approved templates; the test number stays on free-form text.
      const result = env.whatsappUseTemplates()
        ? await sendWhatsAppTemplate(current.primary_phone, plan.template.name, plan.template.params)
        : await sendWhatsAppText(current.primary_phone, plan.body);
      if (!result.ok) {
        await tx`
          update crm_whatsapp_workflows
          set next_message_at = now() + ${RETRY_DELAY_MINUTES} * interval '1 minute', updated_at = now()
          where deal_id = ${row.deal_id}
        `;
        await tx`
          insert into crm_activities (deal_id, actor, type, subject, body, source)
          values (${row.deal_id}, 'system', 'whatsapp_error', 'WhatsApp send failed', ${result.error}, 'automation')
        `;
        console.error(`whatsapp worker deal ${row.deal_id}: send failed — ${result.error} (retrying in ${RETRY_DELAY_MINUTES}m)`);
        return;
      }

      await tx`
        update crm_whatsapp_workflows
        set state = ${plan.nextState}, next_message_at = ${plan.nextMessageAt}, updated_at = now()
        where deal_id = ${row.deal_id}
      `;
      await tx`
        insert into crm_activities (deal_id, actor, type, direction, subject, body, source, source_id)
        values (
          ${row.deal_id}, 'system', 'whatsapp', 'outbound',
          ${plan.subject}, ${plan.body}, 'automation',
          ${result.dryRun ? null : result.messageId}
        )
      `;
      await tx`
        update crm_deals set last_interaction_at = now(), updated_at = now()
        where id = ${row.deal_id}
      `;
      sent += 1;
      console.log(`whatsapp worker deal ${row.deal_id}: sent "${plan.subject}"${result.dryRun ? ' (dry run)' : ''} → next: ${plan.nextMessageAt ?? 'none'}`);
    });
  }
  return sent;
}

declare global {
  // eslint-disable-next-line no-var
  var __whatsappInlineWorker: ReturnType<typeof setInterval> | undefined;
}

// Runs the worker inside the app process (started from instrumentation.ts
// when WHATSAPP_WORKER_INLINE=1), so deployments send without a separate
// cron service or terminal. Row locks keep overlapping runners safe.
export function startInlineWorker(intervalMs = 60_000) {
  if (global.__whatsappInlineWorker) return;
  console.log(`whatsapp worker: inline mode started (every ${Math.round(intervalMs / 1000)}s)`);
  global.__whatsappInlineWorker = setInterval(() => {
    processDueRows().catch((error) => console.error('whatsapp worker pass failed:', error));
  }, intervalMs);
  // A first pass shortly after boot, so deploys don't wait a full minute.
  setTimeout(() => {
    processDueRows().catch((error) => console.error('whatsapp worker pass failed:', error));
  }, 5_000);
}
