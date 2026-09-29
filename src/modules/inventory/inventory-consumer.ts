import { getSql } from '@/core/db';
import { consumeEvents } from '@/core/events';

type Line = { sku: string; quantity: number };

function linesOf(payload: Record<string, unknown>): Line[] {
  const lines = Array.isArray(payload.lines) ? payload.lines : [];
  return lines
    .map((line) => line as Record<string, unknown>)
    .filter((line) => typeof line.sku === 'string' && Number.isInteger(line.quantity))
    .map((line) => ({ sku: line.sku as string, quantity: line.quantity as number }));
}

// Keeps stock in step with orders. Each handler is idempotent, because the
// event bus delivers at least once:
//   order.confirmed  → commit stock per line (unique per order and SKU)
//   order.dispatched → move committed stock out of on-hand, once
//   order.cancelled  → release the commitment
// Purchase orders: sent → the quantity shows as incoming (local) stock, with
// the expected date; received → it moves from incoming to on hand.
export async function consumePurchaseStockEvents(): Promise<number> {
  return consumeEvents('inventory.purchase-stock', ['po.sent', 'po.received'], async (event) => {
    const sql = getSql();
    for (const line of linesOf(event.payload)) {
      if (event.name === 'po.sent') {
        const eta = typeof event.payload.expected_at === 'string' ? event.payload.expected_at : null;
        await sql`
          update inv_items set incoming_local = incoming_local + ${line.quantity},
            incoming_local_eta = greatest(coalesce(incoming_local_eta, ${eta}::date), ${eta}::date), updated_at = now()
          where sku = ${line.sku}
        `;
      } else {
        await sql`
          update inv_items set on_hand = on_hand + ${line.quantity},
            incoming_local = greatest(0, incoming_local - ${line.quantity}),
            incoming_local_eta = case when incoming_local - ${line.quantity} <= 0 then null else incoming_local_eta end,
            updated_at = now()
          where sku = ${line.sku}
        `;
      }
    }
  });
}

export async function consumeOrderStockEvents(): Promise<number> {
  return consumeEvents(
    'inventory.order-stock',
    ['order.confirmed', 'order.dispatched', 'order.cancelled'],
    async (event) => {
      const orderRef = String(event.payload.order_ref ?? '');
      if (!orderRef) return;
      const sql = getSql();

      if (event.name === 'order.confirmed') {
        for (const line of linesOf(event.payload)) {
          await sql`
            insert into inv_commitments (order_ref, sku, quantity)
            select ${orderRef}, ${line.sku}, ${line.quantity}
            where exists (select 1 from inv_items where sku = ${line.sku})
            on conflict (order_ref, sku) do nothing
          `;
        }
        return;
      }

      if (event.name === 'order.dispatched') {
        await sql.begin(async (tx) => {
          const moved = await tx<{ sku: string; quantity: number }[]>`
            update inv_commitments set status = 'dispatched', updated_at = now()
            where order_ref = ${orderRef} and status = 'committed'
            returning sku, quantity
          `;
          for (const row of moved) {
            await tx`
              update inv_items set on_hand = on_hand - ${row.quantity}, updated_at = now()
              where sku = ${row.sku}
            `;
          }
        });
        return;
      }

      await sql`
        update inv_commitments set status = 'released', updated_at = now()
        where order_ref = ${orderRef} and status = 'committed'
      `;
    },
  );
}
