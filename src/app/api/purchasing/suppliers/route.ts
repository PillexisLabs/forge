import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/core/permissions';
import { archiveSupplier, parseSupplier, saveSupplier } from '@/modules/purchasing/supplier-data';

export const runtime = 'nodejs';

// POST { id?, name, email, phone, skus, leadDays } to add or change; { archive: id } to remove.
export async function POST(request: NextRequest) {
  const auth = await requirePermission(request, 'purchasing:write');
  if (!auth.ok) return auth.response;
  const body = await request.json().catch(() => ({}));
  try {
    if (body.archive) {
      await archiveSupplier(Number(body.archive));
      return NextResponse.json({ ok: true });
    }
    const id = await saveSupplier(Number(body.id) || null, parseSupplier(body));
    return NextResponse.json({ ok: true, id });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'The supplier was not saved.' }, { status: 400 });
  }
}
