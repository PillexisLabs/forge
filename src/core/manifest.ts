import type { EventName } from './events';
import type { ForgeNavItem } from './forge-nav';

// The label on the appliance box (plans/PLATFORM.md section 5): one manifest
// per module declares what the module is, which events it pins and reads,
// which env keys it needs, and which screens it puts in the nav. To learn
// what a module touches, read its manifest, not its code.
//
// Core defines the shape but never imports a manifest — the composition root
// at src/modules/registry.ts is the only file that knows every module.
export type ModuleManifest = {
  /** Folder name under src/modules/. */
  name: string;
  version: string;
  description: string;
  /** Sidebar group label. Omitted when the module has no screens of its own. */
  navLabel?: string;
  /** Sidebar entries. Empty when another module hosts this module's screens. */
  nav: ForgeNavItem[];
  events: {
    emits: EventName[];
    consumes: EventName[];
  };
  /** Env keys the module reads (via core env). Secrets stay in config, never in code. */
  configKeys: string[];
};
