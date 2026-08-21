import type { ModuleManifest } from '@/core/manifest';

export const crmManifest: ModuleManifest = {
  name: 'crm',
  version: '1.0.0',
  description: 'The lead pipeline: deals, stages, owners, Cal.com intake, and Fireflies meeting notes.',
  navLabel: 'CRM',
  nav: [
    { id: 'today', label: 'Today', icon: '/icons/calendar-day.svg', href: '/crm' },
    // The WhatsApp screen lives here because the whatsapp module has no nav
    // group of its own yet — its workflow state renders inside CRM views.
    { id: 'automation', label: 'WhatsApp', icon: '/icons/whatsapp.svg', href: '/crm/whatsapp' },
    { id: 'leads', label: 'Leads', icon: '/icons/people.svg', href: '/crm/leads' },
    { id: 'pipeline', label: 'Pipeline', icon: '/icons/kanban.svg', href: '/crm/pipeline' },
    { id: 'followups', label: 'Follow ups', shortLabel: 'Follow', icon: '/icons/bell.svg', href: '/crm/follow-ups' },
    { id: 'calls', label: 'Calls', icon: '/icons/phone.svg', href: '/crm/calls' },
  ],
  events: {
    // Emitted with emittedBy 'core' (the Cal.com webhook is a core intake
    // concern) but the emitting code lives in this module today.
    emits: ['booking.created'],
    consumes: [],
  },
  permissions: [],
  configKeys: [
    'CAL_WEBHOOK_SECRET',
    'FIREFLIES_API_KEY',
  ],
};
