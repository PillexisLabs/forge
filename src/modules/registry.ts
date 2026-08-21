import type { ModuleManifest } from '@/core/manifest';
import { analyticsManifest } from './analytics/manifest';
import { crmManifest } from './crm/manifest';
import { voiceManifest } from './voice/manifest';
import { whatsappManifest } from './whatsapp/manifest';

// The composition root: the one file that knows every installed module.
// Core never imports modules (the ESLint boundary rule enforces it), and
// modules never import each other — so app-level code that needs "all
// modules" (the nav, a future /docs or status page, the Foundry) reads
// this list. A client copy with fewer modules edits exactly this file.
export const MODULES: ModuleManifest[] = [
  analyticsManifest,
  crmManifest,
  whatsappManifest,
  voiceManifest,
];

// Sidebar order = registry order, modules without screens filtered out.
export const NAV_MODULES = MODULES.filter((mod) => mod.nav.length > 0);
