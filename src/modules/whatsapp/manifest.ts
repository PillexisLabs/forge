import type { ModuleManifest } from '@/core/manifest';

export const whatsappManifest: ModuleManifest = {
  name: 'whatsapp',
  version: '1.0.0',
  description: 'WhatsApp confirmations, reminders, inbound intent handling, and consent capture via the Meta Cloud API.',
  // No nav group: the WhatsApp screen renders inside the CRM area today
  // (/crm/whatsapp). It gets its own group when the module grows screens.
  nav: [],
  events: {
    emits: ['lead.replied'],
    consumes: ['booking.created'],
  },
  configKeys: [
    'WHATSAPP_ACCESS_TOKEN',
    'WHATSAPP_PHONE_NUMBER_ID',
    'WHATSAPP_APP_SECRET',
    'WHATSAPP_WEBHOOK_VERIFY_TOKEN',
    'WHATSAPP_GRAPH_VERSION',
    'WHATSAPP_USE_TEMPLATES',
    'WHATSAPP_RESCHEDULE_LINK',
    'WHATSAPP_DRY_RUN',
  ],
};
