import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/core/permissions';
import { parseItem, upsertItem } from '@/modules/inventory/inventory-data';
import { parseCsv } from '@/modules/sheets/sheets-intake';

export const runtime = 'nodejs';

const HEADERS: Record<string, string> = {
  sku: 'sku', code: 'sku', 'item code': 'sku',
  name: 'name', item: 'name', 'item name': 'name', description: 'name',
  unit: 'unit', uom: 'unit',
  rate: 'rate', price: 'rate', 'rate (inr)': 'rate',
  gst: 'gst', 'gst %': 'gst', 'gst rate': 'gst',
  hsn: 'hsn', 'hsn code': 'hsn',
  'on hand': 'on_hand', on_hand: 'on_hand', stock: 'on_hand', 'closing stock': 'on_hand',
  'incoming local': 'incoming_local', incoming_local: 'incoming_local',
  'incoming import': 'incoming_import', incoming_import: 'incoming_import',
};

// Import a catalogue from CSV (for example a Tally stock summary saved as
// CSV). Every row is checked first; nothing is saved if one row is wrong.
export async function POST(request: NextRequest) {
  const auth = await requirePermission(request, 'inventory:write');
  if (!auth.ok) return auth.response;
  const body = await request.json().catch(() => ({}));
  const [header, ...rows] = parseCsv(String(body.csv ?? ''));
  if (!header || !rows.length) return NextResponse.json({ error: 'Paste a CSV with a header row and at least one item.' }, { status: 400 });
  const keys = header.map((h) => HEADERS[h.trim().toLowerCase()] ?? null);
  if (!keys.includes('sku') || !keys.includes('name') || !keys.includes('rate')) {
    return NextResponse.json({ error: 'The CSV needs sku, name and rate columns.' }, { status: 400 });
  }
  try {
    const items = rows.map((row) => parseItem(Object.fromEntries(keys.map((key, i) => [key ?? `_${i}`, row[i] ?? '']))));
    for (const item of items) await upsertItem(item);
    return NextResponse.json({ ok: true, count: items.length });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'The import failed.' }, { status: 400 });
  }
}
