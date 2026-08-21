import { env } from '@/core/env';
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
