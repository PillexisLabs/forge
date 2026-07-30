// The WhatsApp queue worker — the "clock" of the automation.
//
//   npm run crm:whatsapp-worker             # one pass: send everything due now
//   npm run crm:whatsapp-worker -- --watch  # keep running, check every 60s
//   WHATSAPP_DRY_RUN=1 npm run crm:whatsapp-worker   # log instead of sending
//
// Each pass finds workflow rows that are enabled, consented, and due
// (next_message_at <= now), decides the message via resolveDueSend, sends it
// through the Cloud API, and advances the queue — all audited per lead.

import { getSql } from '../src/lib/db';
import { resolveDueSend } from '../src/lib/crm-whatsapp-rules';
import { sendWhatsAppText } from '../src/lib/whatsapp-provider';

const RETRY_DELAY_MINUTES = 10;

async function processDueRows(): Promise<number> {
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
      const current = rows[0] as (typeof rows)[0] & { appointment_at: string | null } | undefined;
      if (!current) return;

      const plan = resolveDueSend({
        state: current.state as Parameters<typeof resolveDueSend>[0]['state'],
        contactName: current.contact_name,
        appointmentAt: current.appointment_at,
        sendCount: Number(current.send_count),
      });

      if (!plan || !current.primary_phone) {
        // Nothing to send from this state (or no phone): clear the stale entry.
        await tx`
          update crm_whatsapp_workflows
          set next_message_at = null, updated_at = now()
          where deal_id = ${row.deal_id}
        `;
        console.log(`deal ${row.deal_id}: stale queue entry cleared (state=${current.state})`);
        return;
      }

      const result = await sendWhatsAppText(current.primary_phone, plan.body);
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
        console.error(`deal ${row.deal_id}: send failed — ${result.error} (retrying in ${RETRY_DELAY_MINUTES}m)`);
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
      console.log(`deal ${row.deal_id}: sent "${plan.subject}"${result.dryRun ? ' (dry run)' : ''} → next: ${plan.nextMessageAt ?? 'none'}`);
    });
  }
  return sent;
}

async function main() {
  const watch = process.argv.includes('--watch');
  do {
    const started = new Date().toISOString();
    try {
      const sent = await processDueRows();
      console.log(`[${started}] pass complete — ${sent} message(s) sent`);
    } catch (error) {
      console.error(`[${started}] pass failed:`, error);
    }
    if (watch) await new Promise((resolve) => setTimeout(resolve, 60_000));
  } while (watch);
  if (!watch) {
    const sql = getSql();
    await sql.end();
  }
}

main();
