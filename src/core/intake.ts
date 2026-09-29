import { getSql } from './db';
import { emitEvent } from './events';
import { markIntegration } from './integrations';

// The intake layer. Every integration (WhatsApp, Google Sheets, webhook,
// email) turns what it receives into one InboundMessage and calls
// recordInbound. The message is stored once (source + external id) and
// `message.received` is emitted. The sales module decides what it means:
// a new enquiry, more detail for an open one, or a buyer's confirmation.

export type IntakeSource = 'whatsapp' | 'sheets' | 'webhook' | 'email' | 'test';

export type InboundMessage = {
  source: IntakeSource;
  externalId: string;
  fromName?: string | null;
  fromPhone?: string | null;
  fromEmail?: string | null;
  company?: string | null;
  subject?: string | null;
  body: string;
  receivedAt?: string;
  raw?: unknown;
  fixture?: boolean;
};

export type InboundRecord = {
  id: number;
  source: IntakeSource;
  external_id: string;
  from_name: string | null;
  from_phone: string | null;
  from_email: string | null;
  company: string | null;
  subject: string | null;
  body: string;
  received_at: string;
  case_id: number | null;
  handled_at: string | null;
  note: string | null;
};

export const SOURCE_LABELS: Record<IntakeSource, string> = {
  whatsapp: 'WhatsApp',
  sheets: 'Google Sheets',
  webhook: 'Webhook',
  email: 'Email',
  test: 'Test message',
};

/** Digits only, with an Indian 10-digit number given the 91 prefix. */
export function normalizePhone(phone: string | null | undefined): string | null {
  const digits = (phone ?? '').replace(/\D/g, '');
  if (!digits) return null;
  if (digits.length === 10) return `91${digits}`;
  if (digits.length === 11 && digits.startsWith('0')) return `91${digits.slice(1)}`;
  return digits;
}

export function normalizeEmail(email: string | null | undefined): string | null {
  const value = (email ?? '').trim().toLowerCase();
  return value.includes('@') ? value : null;
}

/** Store one inbound message and emit message.received. Returns null for a duplicate. */
export async function recordInbound(message: InboundMessage): Promise<InboundRecord | null> {
  const body = message.body.trim();
  if (!body) return null;
  const sql = getSql();
  const record = await sql.begin(async (tx) => {
    const rows = await tx<InboundRecord[]>`
      insert into inbound_messages (source, external_id, from_name, from_phone, from_email, company, subject, body, received_at, raw, fixture)
      values (
        ${message.source}, ${message.externalId}, ${message.fromName?.trim() || null},
        ${normalizePhone(message.fromPhone)}, ${normalizeEmail(message.fromEmail)}, ${message.company?.trim() || null},
        ${message.subject?.trim() || null}, ${body.slice(0, 8000)}, ${message.receivedAt ?? new Date().toISOString()},
        ${message.raw === undefined ? null : tx.json(message.raw as never)}, ${message.fixture === true}
      )
      on conflict (source, external_id) do nothing
      returning *
    `;
    if (!rows.length) return null;
    await emitEvent('message.received', { v: 1, inbound_id: Number(rows[0].id), source: message.source }, {
      emittedBy: 'core', dedupeKey: `inbound:${rows[0].id}`, sql: tx,
    });
    return rows[0];
  }) as InboundRecord | null;
  if (record && message.source !== 'test') await markIntegration(message.source, { ok: true }).catch(() => undefined);
  return record;
}

export async function getInbound(id: number): Promise<InboundRecord | null> {
  const sql = getSql();
  const rows = await sql<InboundRecord[]>`select * from inbound_messages where id = ${id}`;
  return rows[0] ?? null;
}

export async function linkInbound(id: number, caseId: number | null, note: string) {
  const sql = getSql();
  await sql`update inbound_messages set case_id = ${caseId}, handled_at = now(), note = ${note} where id = ${id}`;
}

/** WhatsApp allows free-form replies only within 24 hours of the buyer's last message. */
export async function lastWhatsAppFrom(phone: string): Promise<Date | null> {
  const sql = getSql();
  const rows = await sql<{ at: string | null }[]>`
    select max(received_at) as at from inbound_messages
    where from_phone = ${normalizePhone(phone)} and source in ('whatsapp', 'test')
  `;
  return rows[0]?.at ? new Date(rows[0].at) : null;
}

export async function recentInbound(limit = 30): Promise<InboundRecord[]> {
  const sql = getSql();
  return sql<InboundRecord[]>`select * from inbound_messages order by received_at desc limit ${limit}`;
}

export async function caseMessages(caseId: number) {
  const sql = getSql();
  const inbound = await sql<InboundRecord[]>`select * from inbound_messages where case_id = ${caseId} order by received_at`;
  const outbound = await sql<{ id: number; channel: string; recipient: string; body: string; attachment: string | null; status: string; error: string | null; created_at: string }[]>`
    select id, channel, recipient, body, attachment, status, error, created_at from outbound_messages where case_id = ${caseId} order by created_at
  `;
  return [
    ...inbound.map((m) => ({ direction: 'in' as const, id: `in-${m.id}`, channel: m.source, body: m.body, at: m.received_at, status: null as string | null, error: null as string | null, attachment: null as string | null })),
    ...outbound.map((m) => ({ direction: 'out' as const, id: `out-${m.id}`, channel: m.channel, body: m.body, at: m.created_at, status: m.status, error: m.error, attachment: m.attachment })),
  ].sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
}
