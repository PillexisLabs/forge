import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/core/permissions';
import { archiveItem, parseItem, upsertItem } from '@/modules/inventory/inventory-data';

export const runtime = 'nodejs';

// Add or change one catalogue item: POST { item: {...} }, or archive: { archive: "SKU" }.
export async function POST(request: NextRequest) {
  const auth = await requirePermission(request, 'inventory:write');
  if (!auth.ok) return auth.response;
  const body = await request.json().catch(() => ({}));
  try {
    if (typeof body.archive === 'string') {
      await archiveItem(body.archive);
      return NextResponse.json({ ok: true });
    }
    const item = parseItem(body.item ?? {});
    await upsertItem(item);
    return NextResponse.json({ ok: true, sku: item.sku });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'The item was not saved.' }, { status: 400 });
  }
}
