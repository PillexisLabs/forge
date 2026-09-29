import { NextRequest, NextResponse } from 'next/server';
import { parseAppearance, saveAppearance } from '@/core/appearance';
import { requirePermission } from '@/core/permissions';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const auth = await requirePermission(request, 'core:config');
  if (!auth.ok) return auth.response;
  try {
    await saveAppearance(parseAppearance(await request.json().catch(() => ({}))), auth.user.name);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Not saved.' }, { status: 400 });
  }
}
