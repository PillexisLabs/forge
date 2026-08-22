import { env } from '@/core/env';
import type { CallResult, TelephonyProvider } from './telephony';

// Bolna is a full-stack provider, not just telephony: one POST places the
// call and their platform runs the entire conversation (their +91 Plivo
// number, Deepgram STT, LLM, ElevenLabs TTS). The agent's script lives on
// their dashboard, keyed by BOLNA_AGENT_ID. Results arrive by polling the
// execution — fetchBolnaResult() below is called from the worker's settle
// pass for rows this provider left in_progress.

export const bolnaProvider: TelephonyProvider = {
  name: 'bolna',
  async placeCall({ phone }) {
    const key = env.bolnaApiKey();
    const agentId = env.bolnaAgentId();
    if (!key || !agentId) {
      throw new Error('Bolna is not configured: set BOLNA_API_KEY and BOLNA_AGENT_ID');
    }
    const res = await fetch('https://api.bolna.ai/call', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ agent_id: agentId, recipient_phone_number: phone }),
    });
    if (!res.ok) throw new Error(`Bolna call failed ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const data = (await res.json()) as { execution_id?: string };
    if (!data.execution_id) throw new Error('Bolna returned no execution_id');
    return { provider: 'bolna', providerCallId: data.execution_id };
  },
};

const DONE_STATUSES = new Set(['completed', 'failed', 'error', 'no-answer', 'busy', 'stopped', 'call-disconnected']);

/**
 * Poll one Bolna execution. Returns null while the call is still running.
 * Bolna's transcript is "assistant: ...\nuser: ..." lines; they map onto the
 * same transcript shape the own-pipeline calls record.
 */
export async function fetchBolnaResult(executionId: string): Promise<CallResult | null> {
  const key = env.bolnaApiKey();
  const res = await fetch(`https://api.bolna.ai/executions/${executionId}`, {
    headers: { Authorization: `Bearer ${key}` },
  });
  if (!res.ok) throw new Error(`Bolna execution fetch failed ${res.status}`);
  const data = (await res.json()) as {
    status?: string;
    transcript?: string;
    answered_by_voice_mail?: boolean;
  };
  if (!data.status || !DONE_STATUSES.has(data.status)) return null;

  const transcript = (data.transcript ?? '')
    .split('\n')
    .map((line) => /^(assistant|user):\s*(.*)$/.exec(line.trim()))
    .filter((m): m is RegExpExecArray => m !== null)
    .map((m) => ({ role: (m[1] === 'assistant' ? 'agent' : 'lead') as 'agent' | 'lead', text: m[2] }));

  const failed = data.status !== 'completed' && data.status !== 'call-disconnected';
  return {
    status: failed ? 'failed' : 'completed',
    outcome: data.answered_by_voice_mail ? 'voicemail' : failed ? data.status! : 'completed',
    transcript,
    turnLatencyMs: [],
    error: failed ? `bolna status: ${data.status}` : undefined,
  };
}
