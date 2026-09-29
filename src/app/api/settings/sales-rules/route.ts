import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/core/permissions';
import { parseSalesRules, saveSalesRules } from '@/modules/sales/sales-settings';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const auth = await requirePermission(request, 'core:config');
  if (!auth.ok) return auth.response;
  const body = await request.json().catch(() => ({}));
  try {
    const rules = parseSalesRules(body);
    await saveSalesRules(rules, auth.user.name);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'The rules were not saved.' }, { status: 400 });
  }
}
