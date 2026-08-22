import type { ModuleManifest } from '@/core/manifest';

export const voiceManifest: ModuleManifest = {
  name: 'voice',
  version: '0.1.0',
  description: 'Outbound AI qualification calls in Hinglish: Twilio carries the call, Sarvam listens, thinks, and speaks. Consumes lead.qualified, writes the outcome back, emits call.completed.',
  // No screens yet: call outcomes surface in the CRM activity trail. A nav
  // group arrives with the call review screen.
  nav: [],
  events: {
    emits: ['call.completed', 'followup.requested'],
    consumes: ['lead.qualified'],
  },
  // Placing a call is the module's special action (plans/RBAC.md section 6).
  permissions: ['call'],
  configKeys: [
    'VOICE_FLOW',
    'VOICE_DRY_RUN',
    'VOICE_CALL_WINDOW',
    'VOICE_PUBLIC_URL',
    'TWILIO_ACCOUNT_SID',
    'TWILIO_AUTH_TOKEN',
    'TWILIO_FROM_NUMBER',
    'PLIVO_AUTH_ID',
    'PLIVO_AUTH_TOKEN',
    'PLIVO_FROM_NUMBER',
    'SARVAM_API_KEY',
    'BOLNA_API_KEY',
    'BOLNA_AGENT_ID',
  ],
};
