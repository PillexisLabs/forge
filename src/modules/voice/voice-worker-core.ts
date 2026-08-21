import { getSql } from '@/core/db';
import { emitEvent, consumeEvents } from '@/core/events';
import { env } from '@/core/env';
import {
  callEligibility,
  nextCallTime,
  parseCallWindow,
} from './voice-rules';
import { getTelephonyProvider } from './providers/telephony';

// The queue worker (plans/PLATFORM.md section 8). Two halves, one pass:
//  1. consume lead.qualified -> queue an eligible call (or record why not);
//  2. dial queued calls that are due, inside the IST calling window.
// Both halves are idempotent: the event half dedupes on source_event_id,
// the dial half claims rows with `for update skip locked`.

const CONSUMER = 'voice.call-on-qualified';

export async function queueCallsFromEvents(): Promise<number> {
  return consumeEvents(CONSUMER, ['lead.qualified'], async (event) => {
    const dealId = Number(event.payload.lead_id);
    if (!Number.isInteger(dealId) || dealId < 1) return; // malformed; skip, never retry

    const sql = getSql();
    const [candidate] = await sql<{ phone: string | null; consentStatus: 'unknown' | 'granted' | 'opted_out' }[]>`
      select c.primary_phone as phone,
             coalesce(w.consent_status, 'unknown') as "consentStatus"
      from crm_deals d
      join crm_contacts c on c.id = d.contact_id
      left join crm_whatsapp_workflows w on w.deal_id = d.id
      where d.id = ${dealId}
    `;
    if (!candidate) return; // deal deleted; nothing to do

    const eligibility = callEligibility(candidate);
    const window = parseCallWindow(env.voiceCallWindow());
    const dueAt = nextCallTime(new Date(), window);

    await sql`
      insert into vc_calls (deal_id, phone, status, skip_reason, next_attempt_at, source_event_id)
      values (
        ${dealId},
        ${candidate.phone ?? ''},
        ${eligibility.eligible ? 'queued' : 'skipped'},
        ${eligibility.eligible ? null : eligibility.reason},
        ${eligibility.eligible ? dueAt : null},
        ${event.id}
      )
      on conflict (source_event_id) do nothing
    `;
  });
}

export async function dialDueCalls(): Promise<number> {
  const sql = getSql();
  const window = parseCallWindow(env.voiceCallWindow());
  if (!callWindowOpen(window)) return 0;

  const provider = getTelephonyProvider();
  let dialed = 0;

  // One call at a time: a qualification call takes minutes, and dialing the
  // whole queue at once would need one media bridge per concurrent call.
  for (;;) {
    const claimed = await sql.begin(async (tx) => {
      const rows = await tx<{ id: number; deal_id: number; phone: string }[]>`
        select id, deal_id, phone from vc_calls
        where status = 'queued' and next_attempt_at <= now()
        order by next_attempt_at
        limit 1
        for update skip locked
      `;
      if (!rows.length) return null;
      await tx`
        update vc_calls
        set status = 'dialing', attempts = attempts + 1,
            provider = ${provider.name}, started_at = now(), updated_at = now()
        where id = ${rows[0].id}
      `;
      return rows[0];
    });
    if (!claimed) break;

    try {
      const placed = await provider.placeCall({ callId: Number(claimed.id), phone: claimed.phone });
      if (placed.immediate) {
        // The stub resolves synchronously. The real bridge resolves via its
        // hangup handler, which calls recordCallResult the same way.
        await recordCallResult(Number(claimed.id), placed.immediate);
      } else {
        await sql`
          update vc_calls
          set status = 'in_progress', provider_call_id = ${placed.providerCallId}, updated_at = now()
          where id = ${claimed.id}
        `;
      }
      dialed += 1;
    } catch (error) {
      await sql`
        update vc_calls
        set status = 'failed', error = ${error instanceof Error ? error.message : String(error)},
            ended_at = now(), updated_at = now()
        where id = ${claimed.id}
      `;
    }
  }
  return dialed;
}

/** Shared by the stub path today and the media bridge's hangup handler later. */
export async function recordCallResult(
  callId: number,
  result: {
    status: 'completed' | 'failed';
    outcome: string;
    transcript: Array<{ role: 'agent' | 'lead'; text: string }>;
    turnLatencyMs: number[];
    error?: string;
  },
): Promise<void> {
  const sql = getSql();
  await sql.begin(async (tx) => {
    const rows = await tx<{ deal_id: number; provider: string }[]>`
      update vc_calls
      set status = ${result.status}, outcome = ${result.outcome},
          transcript = ${tx.json(result.transcript as never)},
          turn_latency_ms = ${tx.json(result.turnLatencyMs as never)},
          error = ${result.error ?? null},
          ended_at = now(), updated_at = now()
      where id = ${callId}
      returning deal_id, provider
    `;
    if (!rows.length) return;

    // The activity trail is the CRM's surface for call outcomes until the
    // module grows its own screen.
    await tx`
      insert into crm_activities (deal_id, actor, type, direction, subject, body, source, source_id)
      values (${rows[0].deal_id}, 'voice-agent', 'call', 'outbound',
              ${`AI qualification call: ${result.outcome}`},
              ${result.transcript.map((turn) => `${turn.role}: ${turn.text}`).join('\n')},
              'voice', ${`vc_calls:${callId}`})
      on conflict (source, source_id) where source_id is not null and source_id <> '' do nothing
    `;

    await emitEvent('call.completed', {
      lead_id: rows[0].deal_id,
      call_id: callId,
      outcome: result.outcome,
      transcript_ref: `vc_calls:${callId}`,
      duration_s: null,
    }, { emittedBy: 'voice', dedupeKey: `vc_calls:${callId}`, sql: tx });
  });
}

function callWindowOpen(window: { startHour: number; endHour: number }): boolean {
  return nextCallTime(new Date(), window).getTime() <= Date.now();
}

export async function runVoicePass(): Promise<{ queued: number; dialed: number }> {
  const queued = await queueCallsFromEvents();
  const dialed = await dialDueCalls();
  return { queued, dialed };
}
