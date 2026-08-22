import { env } from '@/core/env';
import { bolnaProvider } from './bolna';
import { stubTelephony } from './stub';
import { twilioTelephony } from './twilio';

// The provider adapter seam (plans/PLATFORM.md section 5): the module speaks
// this interface; the adapter converts for the concrete vendor. The realtime
// audio bridge (Twilio Media Streams <-> Sarvam) stays in spikes/voice-call
// until its latency test passes — this interface covers placing the call and
// receiving its result, which is all the queue worker needs.

export type PlacedCall = {
  provider: string;
  providerCallId: string | null;
  /** The stub completes synchronously; Twilio resolves later via webhook. */
  immediate?: CallResult;
};

export type CallResult = {
  status: 'completed' | 'failed';
  outcome: string;
  transcript: Array<{ role: 'agent' | 'lead'; text: string }>;
  turnLatencyMs: number[];
  error?: string;
};

export type TelephonyProvider = {
  name: string;
  placeCall(input: { callId: number; phone: string }): Promise<PlacedCall>;
};

/** Dry-run unless the real stack is configured AND dry-run is off. */
export function getTelephonyProvider(): TelephonyProvider {
  if (env.voiceDryRun() || !env.twilioAccountSid()) return stubTelephony;
  return twilioTelephony;
}

// A flow names the full provider chain for a call (core feature, 2026-08-22):
//   stub            dry-run, no real call
//   sarvam-twilio   own pipeline, Twilio carries the call
//   sarvam-plivo    own pipeline, Plivo carries the call (Indian rates)
//   bolna           Bolna's hosted platform end to end
// The sarvam-* flows need the realtime media bridge, which still lives in
// spikes/voice-call until its latency test passes — until then they resolve
// to the plain Twilio dial (or the stub in dry-run).
export const VOICE_FLOWS = ['stub', 'sarvam-twilio', 'sarvam-plivo', 'bolna'] as const;
export type VoiceFlow = (typeof VOICE_FLOWS)[number];

export function isVoiceFlow(value: unknown): value is VoiceFlow {
  return typeof value === 'string' && (VOICE_FLOWS as readonly string[]).includes(value);
}

export function getProviderForFlow(flow: VoiceFlow): TelephonyProvider {
  if (env.voiceDryRun() || flow === 'stub') return stubTelephony;
  if (flow === 'bolna') return bolnaProvider;
  return twilioTelephony;
}
