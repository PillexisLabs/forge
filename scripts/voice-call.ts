// Place one ad-hoc voice call through the module: pick a flow, give a number.
//
//   npm run voice:call -- bolna +919999999999
//   npm run voice:call -- stub  +919999999999     # dry-run, no phone rings
//
// The call is queued in vc_calls (no CRM deal — this is the demo/test path),
// dialed immediately, and for hosted flows the script waits and prints the
// transcript when the platform reports the call finished.
//
// The sarvam-* flows still need the media bridge from spikes/voice-call —
// use `npx tsx spikes/voice-call/call.ts sarvam-plivo <number>` for those
// until the bridge graduates into the module.

import { getSql } from '../src/core/db';
import { isVoiceFlow, VOICE_FLOWS } from '../src/modules/voice/providers/telephony';
import {
  dialDueCalls,
  queueAdHocCall,
  settleHostedCalls,
} from '../src/modules/voice/voice-worker-core';

async function main() {
  const [flow, phone] = process.argv.slice(2);
  if (!isVoiceFlow(flow) || !/^\+\d{8,15}$/.test(phone ?? '')) {
    console.error(`Usage: npm run voice:call -- <${VOICE_FLOWS.join('|')}> <+91XXXXXXXXXX>`);
    process.exit(1);
  }
  if (flow.startsWith('sarvam-')) {
    console.error('sarvam-* flows need the media bridge: npx tsx spikes/voice-call/call.ts ' + flow + ' ' + phone);
    process.exit(1);
  }

  const sql = getSql();
  const callId = await queueAdHocCall({ phone, flow, dueNow: true });
  console.log(`queued vc_calls#${callId} (flow ${flow}) → dialing…`);
  await dialDueCalls();

  const [row] = await sql<{ status: string; provider_call_id: string | null; error: string | null }[]>`
    select status, provider_call_id, error from vc_calls where id = ${callId}
  `;
  console.log(`status: ${row.status}${row.error ? ` — ${row.error}` : ''}`);

  // Hosted flows finish asynchronously; wait for the platform to settle.
  while (['dialing', 'in_progress'].includes((await currentStatus(callId)))) {
    await new Promise((resolve) => setTimeout(resolve, 15_000));
    const settled = await settleHostedCalls();
    if (settled) break;
    console.log('call in progress…');
  }

  const [done] = await sql<{ status: string; outcome: string | null; transcript: unknown }[]>`
    select status, outcome, transcript from vc_calls where id = ${callId}
  `;
  console.log(`final: ${done.status} (${done.outcome ?? '—'})`);
  const turns = done.transcript as Array<{ role: string; text: string }>;
  if (Array.isArray(turns) && turns.length) {
    console.log('\nTranscript:');
    for (const turn of turns) console.log(`  ${turn.role}: ${turn.text}`);
  }
  await sql.end({ timeout: 5 });
}

async function currentStatus(callId: number): Promise<string> {
  const sql = getSql();
  const [row] = await sql<{ status: string }[]>`select status from vc_calls where id = ${callId}`;
  return row?.status ?? 'missing';
}

main();
