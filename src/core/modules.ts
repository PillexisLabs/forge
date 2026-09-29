import { env } from './env';

// Which modules this instance runs. The instance's FORGE_MODULES setting
// lists them; unset means all. Pages and API routes of a disabled module
// return 404, and its nav entries do not render.
export function enabledModuleNames(): string[] | null {
  const raw = env.forgeModules().trim();
  if (!raw) return null;
  return raw.split(',').map((name) => name.trim()).filter(Boolean);
}

export function isModuleEnabled(name: string): boolean {
  const names = enabledModuleNames();
  return names === null || names.includes(name);
}
