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
