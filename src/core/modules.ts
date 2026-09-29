import { env } from './env';
import { getSettings, saveSettings } from './settings';

// Two levels decide which modules an instance shows:
//
// 1. Installed: the instance's FORGE_MODULES setting (unset means all).
//    This is the deployment's ceiling, set when the instance is created.
//    Background work (intake, consumers) runs for every installed module.
// 2. Switched on: Settings → Modules, which an admin changes at any time
//    with no restart, for example to show a client demo or the full
//    workspace. A switched-off module hides its screens and returns 404.

export function enabledModuleNames(): string[] | null {
  const raw = env.forgeModules().trim();
  if (!raw) return null;
  return raw.split(',').map((name) => name.trim()).filter(Boolean);
}

/** Installed in this instance (FORGE_MODULES). Sync, for composition roots. */
export function isModuleEnabled(name: string): boolean {
  const names = enabledModuleNames();
  return names === null || names.includes(name);
}

export async function switchedOffModules(): Promise<string[]> {
  const value = await getSettings<{ off: string[] }>('modules', { off: [] }).catch(() => ({ off: [] as string[] }));
  return Array.isArray(value.off) ? value.off : [];
}

/** Installed and switched on: the module's screens are visible now. */
export async function isModuleOn(name: string): Promise<boolean> {
  return isModuleEnabled(name) && !(await switchedOffModules()).includes(name);
}

export async function saveSwitchedOffModules(off: string[], actorName: string) {
  await saveSettings('modules', { off: [...new Set(off)] }, actorName);
}
