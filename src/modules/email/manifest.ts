import type { ModuleManifest } from '@/core/manifest';

export const emailManifest: ModuleManifest = {
  name: 'email',
  version: '0.1.0',
  description: 'Email intake over IMAP and replies over SMTP: new emails become inbound messages, and jobs send on the email channel.',
  nav: [],
  events: { emits: ['message.received'], consumes: [] },
  permissions: [],
  configKeys: [],
};
