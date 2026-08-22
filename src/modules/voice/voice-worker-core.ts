import { getSql } from '@/core/db';
import { emitEvent, consumeEvents } from '@/core/events';
import { env } from '@/core/env';
import {
  callEligibility,
  nextCallTime,
  parseCallWindow,
} from './voice-rules';
import {
  getProviderForFlow,
  isVoiceFlow,
  type VoiceFlow,
} from './providers/telephony';
import { fetchBolnaResult } from './providers/bolna';

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
    const flow = isVoiceFlow(env.voiceDefaultFlow()) ? env.voiceDefaultFlow() : 'stub';

    await sql`
      insert into vc_calls (deal_id, phone, status, skip_reason, next_attempt_at, source_event_id, flow)
      values (
        ${dealId},
        ${candidate.phone ?? ''},
        ${eligibility.eligible ? 'queued' : 'skipped'},
        ${eligibility.eligible ? null : eligibility.reason},
        ${eligibility.eligible ? dueAt : null},
        ${event.id},
        ${flow}
      )
      on conflict (source_event_id) do nothing
    `;
  });
}

export async function dialDueCalls(): Promise<number> {
  const sql = getSql();
  const window = parseCallWindow(env.voiceCallWindow());
  const windowOpen = callWindowOpen(window);

  let dialed = 0;

  // One call at a time: a qualification call takes minutes, and dialing the
  // whole queue at once would need one media bridge per concurrent call.
  // Lead calls respect the IST window; ad-hoc demo calls (no deal) are
  // founder-initiated and dial whenever they are due.
  for (;;) {
    const claimed = await sql.begin(async (tx) => {
      const rows = await tx<{ id: number; deal_id: number | null; phone: string; flow: string }[]>`
        select id, deal_id, phone, flow from vc_calls
        where status = 'queued' and next_attempt_at <= now()
          and (deal_id is null or ${windowOpen})
        order by next_attempt_at
        limit 1
        for update skip locked
      `;
      if (!rows.length) return null;
      const provider = getProviderForFlow(isVoiceFlow(rows[0].flow) ? rows[0].flow : 'stub');
      await tx`
        update vc_calls
        set status = 'dialing', attempts = attempts + 1,
            provider = ${provider.name}, started_at = now(), updated_at = now()
        where id = ${rows[0].id}
      `;
      return rows[0];
    });
    if (!claimed) break;

    const provider = getProviderForFlow(isVoiceFlow(claimed.flow) ? claimed.flow : 'stub');
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
    const rows = await tx<{ deal_id: number | null; provider: string }[]>`
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

    // Ad-hoc demo calls have no deal behind them: the vc_calls row is their
    // whole record. CRM activity and events are lead concerns.
    if (rows[0].deal_id == null) return;

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

/**
 * Settle pass for hosted-platform calls: bolna rows sit in_progress while
 * their platform runs the conversation; poll each execution and record the
 * result when it lands. Idempotent — a settled row leaves in_progress.
 */
export async function settleHostedCalls(): Promise<number> {
  const sql = getSql();
  const rows = await sql<{ id: number; provider_call_id: string }[]>`
    select id, provider_call_id from vc_calls
    where status = 'in_progress' and flow = 'bolna' and provider_call_id is not null
    order by started_at
    limit 10
  `;
  let settled = 0;
  for (const row of rows) {
    try {
      const result = await fetchBolnaResult(row.provider_call_id);
      if (result) {
        await recordCallResult(Number(row.id), result);
        settled += 1;
      }
    } catch (error) {
      console.error(`settle failed for vc_calls#${row.id}:`, error);
    }
  }
  return settled;
}

/**
 * Queue one ad-hoc call outside the lead flow — the demo path ("give a
 * number and a flow"). Founder-initiated, so the consent gate is the caller;
 * the calling-window rule still applies unless dueNow forces it.
 */
export async function queueAdHocCall(input: {
  phone: string;
  flow: VoiceFlow;
  dueNow?: boolean;
}): Promise<number> {
  const sql = getSql();
  const window = parseCallWindow(env.voiceCallWindow());
  const dueAt = input.dueNow ? new Date() : nextCallTime(new Date(), window);
  const rows = await sql<{ id: number }[]>`
    insert into vc_calls (deal_id, phone, status, next_attempt_at, flow)
    values (null, ${input.phone}, 'queued', ${dueAt}, ${input.flow})
    returning id
  `;
  return Number(rows[0].id);
}

function callWindowOpen(window: { startHour: number; endHour: number }): boolean {
  return nextCallTime(new Date(), window).getTime() <= Date.now();
}

export async function runVoicePass(): Promise<{ queued: number; dialed: number; settled: number }> {
  const queued = await queueCallsFromEvents();
  const dialed = await dialDueCalls();
  const settled = await settleHostedCalls();
  return { queued, dialed, settled };
}
