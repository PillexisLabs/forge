import { getSql } from '@/core/db';
import { consumeEvents } from '@/core/events';
import { createCase, ruleActor } from '@/core/jobs';
import { productSource } from '@/core/products';
import { getSettings } from '@/core/settings';
import { purchaseJob, type PoLine } from './purchase-job';
import { listSuppliers, supplierFor } from './supplier-data';

const PO_RULE = ruleActor('purchasing.shortage', 'Purchase rule');

// order.confirmed → for each item the order leaves short, a draft purchase
// order to that item's supplier (one PO per supplier). Only when Settings →
// Orders & payments has "Draft purchase orders" on. Runs after inventory
// commits the order, so free stock below zero is the shortfall.
export async function consumeOrderShortages(): Promise<number> {
  return consumeEvents('purchasing.order-shortages', ['order.confirmed'], async (event) => {
    const rules = await getSettings<{ supplierPos: boolean }>('orders', { supplierPos: false });
    if (!rules.supplierPos) return;
    // At-least-once delivery: an order that already has its POs gets no more.
    const sql = getSql();
    const orderRef = String(event.payload.order_ref ?? '');
    const [existing] = await sql`select 1 from cases where job = 'purchase' and data->>'forOrder' = ${orderRef} limit 1`;
    if (existing) return;
    const lines = (Array.isArray(event.payload.lines) ? event.payload.lines : []) as { sku: string; quantity: number }[];
    const products = await productSource().get(lines.map((l) => l.sku));
    const suppliers = await listSuppliers();
    const bySupplier = new Map<string, { supplier: ReturnType<typeof supplierFor>; lines: PoLine[] }>();
    for (const line of lines) {
      const p = products.find((x) => x.sku === line.sku);
      if (!p) continue;
      const incoming = p.incomingLocal + p.incomingImport;
      const short = Math.min(line.quantity, Math.max(0, -(p.available + incoming)));
      if (short <= 0) continue;
      const supplier = supplierFor(p.sku, suppliers);
      const key = supplier ? String(supplier.id) : 'none';
      const group = bySupplier.get(key) ?? { supplier, lines: [] };
      group.lines.push({ sku: p.sku, name: p.name, unit: p.unit, quantity: short });
      bySupplier.set(key, group);
    }
    for (const group of bySupplier.values()) {
      await createCase(purchaseJob, 'draftForShortage', {
        lines: group.lines,
        supplier: group.supplier ? { id: group.supplier.id, name: group.supplier.name, email: group.supplier.email, phone: group.supplier.phone, leadDays: group.supplier.lead_days } : null,
        forOrder: String(event.payload.order_ref ?? ''),
        fixture: event.payload.fixture === true,
      }, PO_RULE);
    }
  });
}
