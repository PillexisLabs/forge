import { NextRequest, NextResponse } from 'next/server';
import { enabledModuleNames, saveSwitchedOffModules } from '@/core/modules';
import { requirePermission } from '@/core/permissions';
import { MODULES } from '@/modules/registry';

export const runtime = 'nodejs';

// Settings → Modules: POST { on: ["sales", "orders", ...] }. Every installed
// module not in the list is switched off. Takes effect on the next page load.
export async function POST(request: NextRequest) {
  const auth = await requirePermission(request, 'core:config');
  if (!auth.ok) return auth.response;
  const body = await request.json().catch(() => ({}));
  const on = Array.isArray(body.on) ? body.on.map(String) : null;
  if (!on) return NextResponse.json({ error: 'Send the list of modules to switch on.' }, { status: 400 });
  const installed = enabledModuleNames() ?? MODULES.map((mod) => mod.name);
  const withScreens = MODULES.filter((mod) => mod.nav.length > 0 && installed.includes(mod.name)).map((mod) => mod.name);
  if (!on.some((name: string) => withScreens.includes(name))) {
    return NextResponse.json({ error: 'Keep at least one module with screens switched on.' }, { status: 400 });
  }
  await saveSwitchedOffModules(installed.filter((name) => !on.includes(name)), auth.user.name);
  return NextResponse.json({ ok: true });
}
