import type { TelephonyProvider } from './telephony';

// The dev/dry-run provider: no phone rings, no API is called. It returns a
// plausible completed qualification call so the queue, the CRM write-back,
// and the call.completed consumers can all be exercised without credentials.

export const stubTelephony: TelephonyProvider = {
  name: 'stub',
  async placeCall({ callId, phone }) {
    console.log(`[voice:stub] would dial ${phone} for vc_calls#${callId}`);
    return {
      provider: 'stub',
      providerCallId: `stub-${callId}`,
      immediate: {
        status: 'completed',
        outcome: 'qualified',
        transcript: [
          { role: 'agent', text: 'Namaste! Pillexis se bol rahi hoon — kya abhi 2 minute baat kar sakte hain?' },
          { role: 'lead', text: 'Haan, boliye.' },
          { role: 'agent', text: '(stub call — no real audio was exchanged)' },
        ],
        turnLatencyMs: [850, 920],
      },
    };
  },
};
