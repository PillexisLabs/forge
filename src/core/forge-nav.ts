// The nav item shape used by module manifests and the workspace chrome.
// The entries themselves live in each module's manifest (src/modules/*/
// manifest.ts) and are assembled by src/modules/registry.ts — core defines
// the shape but never knows the modules.

export type ForgeNavItem = {
  id: string;
  label: string;
  /** Compact label for the mobile bottom nav; falls back to `label`. */
  shortLabel?: string;
  icon: string;
  href: string;
};
