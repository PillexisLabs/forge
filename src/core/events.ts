import type { Sql, TransactionSql } from 'postgres';
import { getSql } from './db';

// The event bus (plans/PLATFORM.md section 4). One Postgres `events` table
// used as an outbox. A module emits an event; other modules subscribe by
// event name and track their own cursor. Modules never import each other —
// this file and the data spine are the only ways they interact.

export type EventName =
  | 'lead.created'
  | 'lead.replied'
  | 'lead.qualified'
  | 'call.completed'
  | 'booking.created'
  | 'followup.requested'
  | 'sync.completed'
  // Job events (src/core/jobs.ts). Payloads carry `v: 1`; a breaking payload
  // change gets a new name rather than a silent shape change.
  | 'quote.sent'
  | 'quote.accepted'
  | 'order.confirmed'
  | 'order.dispatched'
  | 'order.cancelled'
  // Intake (src/core/intake.ts): any integration received a message.
  | 'message.received'
  // A quote reached "approved"; the sales module sends it on its channel.
  | 'quote.approved'
  // A new enquiry exists (from intake or recorded by a person).
  | 'quote.recorded'
  // An order is paid in full.
  | 'order.paid'
  // A buyer with an open order wrote a message that belongs to the order.
  | 'order.message'
  // Purchasing: a purchase order went to the supplier, or its stock arrived.
  | 'po.sent'
  | 'po.received'
  // A case's customer details changed (src/core/customers.ts); the CRM keeps the record.
  | 'customer.updated';

export type EmittedBy =
  | 'core' | 'analytics' | 'whatsapp' | 'crm' | 'lead-qual' | 'voice'
  | 'sales' | 'orders' | 'inventory' | 'purchasing';

export type ForgeEvent = {
  id: number;
  name: EventName;
  payload: Record<string, unknown>;
  emitted_by: EmittedBy;
  created_at: string;
};

type AnySql = Sql | TransactionSql;

/**
 * Emit one event. Pass the caller's transaction when the event belongs to a
 * larger write (the outbox pattern): the event then commits or rolls back
 * with the data it describes. A dedupeKey makes the emit idempotent per
 * event name — a retried webhook emits once.
 */
export async function emitEvent(
  name: EventName,
  payload: Record<string, unknown>,
  opts: { emittedBy: EmittedBy; dedupeKey?: string; sql?: AnySql },
): Promise<void> {
  const sql = opts.sql ?? getSql();
  await sql`
    insert into events (name, payload, emitted_by, dedupe_key)
    values (${name}, ${sql.json(payload as never)}, ${opts.emittedBy}, ${opts.dedupeKey ?? null})
    on conflict (name, dedupe_key) where dedupe_key is not null do nothing
  `;
}

/**
 * One consumer pass: deliver undelivered events of the named types to the
 * handler, oldest first, then advance the consumer's cursor.
 *
 * Delivery is at-least-once. The cursor only moves past events whose handler
 * finished without throwing; the first failure stops the pass and the event
 * is retried on the next pass. Handlers must therefore be idempotent.
 * The cursor row is taken with `for update skip locked`, so overlapping
 * passes (two worker instances) never double-deliver.
 */
export async function consumeEvents(
  consumer: string,
  names: EventName[],
  handler: (event: ForgeEvent) => Promise<void>,
  opts: { batchSize?: number } = {},
): Promise<number> {
  const sql = getSql();
  const batchSize = opts.batchSize ?? 20;

  return sql.begin(async (tx) => {
    await tx`
      insert into event_cursors (consumer) values (${consumer})
      on conflict (consumer) do nothing
    `;
    const cursors = await tx<{ last_event_id: string }[]>`
      select last_event_id from event_cursors
      where consumer = ${consumer}
      for update skip locked
    `;
    if (!cursors.length) return 0; // another pass holds the cursor

    const events = await tx<ForgeEvent[]>`
      select id, name, payload, emitted_by, created_at from events
      where id > ${cursors[0].last_event_id} and name = any(${names})
      order by id asc
      limit ${batchSize}
    `;

    let delivered = 0;
    let lastId = Number(cursors[0].last_event_id);
    for (const event of events) {
      try {
        await handler(event);
      } catch (error) {
        console.error(`event consumer ${consumer}: handler failed on ${event.name}#${event.id}, will retry`, error);
        break;
      }
      lastId = Number(event.id);
      delivered += 1;
    }

    // Also skip past ids the name filter excluded, up to the last delivered
    // event, so the next pass does not rescan them. (Undelivered names below
    // lastId were never selected; names we care about are all handled.)
    if (lastId > Number(cursors[0].last_event_id)) {
      await tx`
        update event_cursors
        set last_event_id = ${lastId}, updated_at = now()
        where consumer = ${consumer}
      `;
    }
    return delivered;
  }) as Promise<number>;
}
