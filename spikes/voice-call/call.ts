// One command, two flows — the client-demo entry point.
//
//   npx tsx call.ts bolna         +919999999999
//   npx tsx call.ts sarvam-plivo  +919999999999
//   npx tsx call.ts sarvam-twilio +919999999999
//
// bolna:         POST to Bolna's hosted platform (their agent, their +91
//                number, their AI stack). Polls until the call ends and
//                prints the transcript.
// sarvam-*:      runs our own streamed pipeline (spike.ts) with the chosen
//                telephony carrier. Starts an ngrok tunnel automatically if
//                one is not already running.
//
// Env (keys/.env): BOLNA_API_KEY [+ BOLNA_AGENT_ID], SARVAM_API_KEY, and the
// TWILIO_* or PLIVO_* set for the chosen carrier.

import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

const [flow, to] = process.argv.slice(2);
const FLOWS = ['bolna', 'sarvam-plivo', 'sarvam-twilio'] as const;

if (!FLOWS.includes(flow as (typeof FLOWS)[number]) || !/^\+\d{8,15}$/.test(to ?? '')) {
  console.error(`Usage: npx tsx call.ts <${FLOWS.join('|')}> <+91XXXXXXXXXX>`);
  process.exit(1);
}

const DEFAULT_BOLNA_AGENT = 'aeae1574-4c82-463f-9634-ed300716869c'; // Asha - Pillexis Labs

async function callBolna() {
  const key = process.env.BOLNA_API_KEY;
  if (!key) { console.error('Missing BOLNA_API_KEY'); process.exit(1); }
  const agentId = process.env.BOLNA_AGENT_ID ?? DEFAULT_BOLNA_AGENT;

  const res = await fetch('https://api.bolna.ai/call', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ agent_id: agentId, recipient_phone_number: to }),
  });
  if (!res.ok) { console.error(`Bolna call failed ${res.status}: ${await res.text()}`); process.exit(1); }
  const { execution_id } = (await res.json()) as { execution_id: string };
  console.log(`dialing ${to} via bolna — execution ${execution_id}. Answer the phone.`);

  const DONE = new Set(['completed', 'failed', 'error', 'no-answer', 'busy', 'stopped', 'call-disconnected']);
  for (;;) {
    await new Promise((resolve) => setTimeout(resolve, 15_000));
    const poll = await fetch(`https://api.bolna.ai/executions/${execution_id}`, {
      headers: { Authorization: `Bearer ${key}` },
    });
    const data = (await poll.json()) as { status?: string; transcript?: string; total_cost?: number };
    console.log(`status: ${data.status}`);
    if (data.status && DONE.has(data.status)) {
      console.log(`cost: ${data.total_cost}¢`);
      console.log('\nTranscript:\n' + (data.transcript ?? '(none)'));
      return;
    }
  }
}

async function ensureTunnel(): Promise<string> {
  const tunnelUrl = async () => {
    try {
      const res = await fetch('http://localhost:4040/api/tunnels');
      const { tunnels } = (await res.json()) as { tunnels: { public_url: string }[] };
      return tunnels[0]?.public_url ?? null;
    } catch { return null; }
  };

  const existing = await tunnelUrl();
  if (existing) return existing;

  console.log('starting ngrok tunnel…');
  spawn('ngrok', ['http', '8090'], { detached: true, stdio: 'ignore' }).unref();
  for (let i = 0; i < 15; i++) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    const url = await tunnelUrl();
    if (url) return url;
  }
  console.error('ngrok tunnel did not come up — is ngrok installed and authed?');
  process.exit(1);
}

async function callSarvam(carrier: 'twilio' | 'plivo') {
  const publicUrl = await ensureTunnel();
  console.log(`tunnel: ${publicUrl}`);
  const child = spawn('npx', ['tsx', join(HERE, 'spike.ts')], {
    stdio: 'inherit',
    env: {
      ...process.env,
      SPIKE_TO_NUMBER: to,
      SPIKE_TELEPHONY: carrier,
      PUBLIC_URL: publicUrl,
    },
  });
  child.on('exit', (code) => process.exit(code ?? 0));
}

if (flow === 'bolna') void callBolna();
else void callSarvam(flow === 'sarvam-plivo' ? 'plivo' : 'twilio');
