import type { ModuleManifest } from '@/core/manifest';

export const sheetsManifest: ModuleManifest = {
  name: 'sheets',
  version: '0.1.0',
  description: 'Google Sheets intake: each new row in a shared sheet becomes an inbound message.',
  nav: [],
  events: { emits: ['message.received'], consumes: [] },
  permissions: [],
  configKeys: [],
};
