import type { Sql, TransactionSql } from 'postgres';
import { getSql } from '@/core/db';
import type { Product, ProductSource } from '@/core/products';

type ItemRow = {
  sku: string;
  name: string;
  unit: string;
  rate_paise: string;
  gst_rate_bp: number;
  hsn: string | null;
  on_hand: number;
  incoming_local: number;
  incoming_import: number;
  committed: string;
};

function toProduct(row: ItemRow): Product {
  const committed = Number(row.committed);
  return {
    sku: row.sku,
    name: row.name,
    unit: row.unit,
    ratePaise: Number(row.rate_paise),
    gstRateBp: row.gst_rate_bp,
    hsn: row.hsn,
    onHand: row.on_hand,
    incomingLocal: row.incoming_local,
    incomingImport: row.incoming_import,
    committed,
    available: row.on_hand - committed,
  };
}

async function selectItems(sql: Sql | TransactionSql, skus?: string[]): Promise<Product[]> {
  const rows = await sql<ItemRow[]>`
    select i.sku, i.name, i.unit, i.rate_paise, i.gst_rate_bp, i.hsn,
           i.on_hand, i.incoming_local, i.incoming_import,
           coalesce(sum(c.quantity) filter (where c.status = 'committed'), 0) as committed
    from inv_items i
    left join inv_commitments c on c.sku = i.sku
    where i.active
      ${skus ? sql`and i.sku = any(${skus})` : sql``}
    group by i.sku
    order by i.name asc
  `;
  return rows.map(toProduct);
}

/** The inventory module's implementation of the core product interface. */
export const inventoryProductSource: ProductSource = {
  label: 'Forge catalogue',
  list: () => selectItems(getSql()),
  get: (skus, sql) => selectItems(sql ?? getSql(), skus),
};

// ---------- catalogue editing (Stock → Add item / Import) ----------

export type ItemInput = {
  sku: string;
  name: string;
  unit: string;
  rateRupees: number;
  gstPercent: number;
  hsn: string | null;
  onHand: number;
  incomingLocal: number;
  incomingImport: number;
};

function whole(value: unknown, label: string): number {
  const n = typeof value === 'string' ? Number(value.replace(/,/g, '').trim() || '0') : Number(value ?? 0);
  if (!Number.isFinite(n) || n < 0) throw new Error(`${label} must be zero or more.`);
  return Math.round(n);
}

export function parseItem(raw: Record<string, unknown>): ItemInput {
  const sku = String(raw.sku ?? '').trim().toUpperCase();
  const name = String(raw.name ?? '').trim();
  if (!/^[A-Z0-9][A-Z0-9._-]{0,39}$/.test(sku)) throw new Error('The SKU must be 1 to 40 letters, digits, dots, dashes or underscores.');
  if (!name) throw new Error(`The item name is required (${sku}).`);
  const rate = Number(String(raw.rateRupees ?? raw.rate ?? '').replace(/[₹,\s]/g, ''));
  if (!Number.isFinite(rate) || rate < 0) throw new Error(`The rate for ${sku} must be a number in rupees.`);
  const gst = Number(String(raw.gstPercent ?? raw.gst ?? '18').replace('%', ''));
  if (!Number.isFinite(gst) || gst < 0 || gst > 28) throw new Error(`GST for ${sku} must be between 0 and 28 percent.`);
  return {
    sku, name,
    unit: String(raw.unit ?? 'pcs').trim() || 'pcs',
    rateRupees: rate,
    gstPercent: gst,
    hsn: String(raw.hsn ?? '').trim() || null,
    onHand: whole(raw.onHand ?? raw.on_hand, `On hand for ${sku}`),
    incomingLocal: whole(raw.incomingLocal ?? raw.incoming_local, `Incoming local for ${sku}`),
    incomingImport: whole(raw.incomingImport ?? raw.incoming_import, `Incoming import for ${sku}`),
  };
}

export async function upsertItem(item: ItemInput) {
  const sql = getSql();
  await sql`
    insert into inv_items (sku, name, unit, rate_paise, gst_rate_bp, hsn, on_hand, incoming_local, incoming_import, active, updated_at)
    values (${item.sku}, ${item.name}, ${item.unit}, ${Math.round(item.rateRupees * 100)}, ${Math.round(item.gstPercent * 100)}, ${item.hsn},
            ${item.onHand}, ${item.incomingLocal}, ${item.incomingImport}, true, now())
    on conflict (sku) do update set
      name = excluded.name, unit = excluded.unit, rate_paise = excluded.rate_paise, gst_rate_bp = excluded.gst_rate_bp,
      hsn = excluded.hsn, on_hand = excluded.on_hand, incoming_local = excluded.incoming_local,
      incoming_import = excluded.incoming_import, active = true, updated_at = now()
  `;
}

export async function archiveItem(sku: string) {
  const sql = getSql();
  await sql`update inv_items set active = false, updated_at = now() where sku = ${sku}`;
}
