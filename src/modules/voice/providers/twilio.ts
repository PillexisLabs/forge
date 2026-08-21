import { env } from '@/core/env';
import type { TelephonyProvider } from './telephony';

// Twilio Programmable Voice adapter. Placing the call is a REST POST; the
// conversation itself runs over Media Streams against VOICE_PUBLIC_URL,
// which must serve the audio bridge. That bridge lives in spikes/voice-call
// until its 1.2 s/turn latency test passes — until then this adapter dials
// and the call plays the spike's stream, or fails clearly when unconfigured.

export const twilioTelephony: TelephonyProvider = {
  name: 'twilio',
  async placeCall({ callId, phone }) {
    const accountSid = env.twilioAccountSid();
    const authToken = env.twilioAuthToken();
    const from = env.twilioFromNumber();
    const publicUrl = env.voicePublicUrl();
    if (!accountSid || !authToken || !from) {
      throw new Error('Twilio is not configured: set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER');
    }
    if (!publicUrl) {
      throw new Error('VOICE_PUBLIC_URL is not set — the media-stream bridge needs a public wss endpoint');
    }

    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Stream url="${publicUrl.replace(/^http/, 'ws')}/voice/stream">
      <Parameter name="callId" value="${callId}" />
    </Stream>
  </Connect>
</Response>`;

    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Calls.json`,
      {
        method: 'POST',
        headers: {
          authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`,
          'content-type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({ To: phone, From: from, Twiml: twiml }),
      },
    );
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Twilio call create failed (${res.status}): ${body.slice(0, 300)}`);
    }
    const call = (await res.json()) as { sid?: string };
    return { provider: 'twilio', providerCallId: call.sid ?? null };
  },
};
