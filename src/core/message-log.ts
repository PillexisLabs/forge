import { getSql } from './db';

// One log of every message Forge received or sent, for the Message log page.
// Received messages come from inbound_messages; sent messages come from
// outbound_messages. Both keep the case they belong to.

export type LogDirection = 'in' | 'out';
export type LogOutcome = 'created' | 'added' | 'waiting' | 'sent' | 'test' | 'failed';

export type LogEntry = {
  key: string;
  direction: LogDirection;
  channel: string;
  contact: string;
  detail: string | null;
  subject: string | null;
  body: string;
  at: string;
  outcome: LogOutcome;
  note: string | null;
  error: string | null;
  attachment: string | null;
  caseRef: string | null;
};

export type LogFilter = { view: 'all' | 'in' | 'out' | 'attention'; channel: string | null; q: string | null };

type Row = {
  key: string; direction: LogDirection; channel: string; contact: string | null; detail: string | null; subject: string | null;
  body: string; at: string; status: string | null; note: string | null; error: string | null; attachment: string | null;
  case_ref: string | null; handled: boolean;
};

function outcomeOf(r: Row): LogOutcome {
  if (r.direction === 'out') return r.status === 'failed' ? 'failed' : r.status === 'test' ? 'test' : 'sent';
  if (!r.handled) return 'waiting';
  return r.note?.startsWith('Created') ? 'created' : 'added';
}

export async function messageLog(filter: LogFilter, limit = 100): Promise<LogEntry[]> {
  const sql = getSql();
  const q = filter.q ? `%${filter.q.replace(/[%_]/g, '')}%` : null;
  const rows = await sql<Row[]>`
    select * from (
      select 'in-' || m.id as key, 'in' as direction, m.source as channel,
             coalesce(m.from_name, m.from_phone, m.from_email) as contact,
             case when m.from_name is not null then coalesce(m.company, m.from_phone, m.from_email) else m.company end as detail,
             m.subject, m.body, m.received_at as at, null as status, m.note, null as error, null as attachment,
             c.ref as case_ref, m.handled_at is not null as handled
      from inbound_messages m left join cases c on c.id = m.case_id
      union all
      select 'out-' || o.id, 'out', o.channel, coalesce(c.subject->>'buyerName', o.recipient),
             case when c.subject->>'buyerName' is not null then o.recipient end,
             null, o.body, o.created_at, o.status, null, o.error, o.attachment,
             c.ref, true
      from outbound_messages o left join cases c on c.id = o.case_id
    ) log
    where (${filter.view} = 'all'
           or (${filter.view} = 'in' and direction = 'in')
           or (${filter.view} = 'out' and direction = 'out')
           or (${filter.view} = 'attention' and ((direction = 'in' and not handled) or status = 'failed')))
      and (${filter.channel}::text is null or channel = ${filter.channel})
      and (${q}::text is null or body ilike ${q} or contact ilike ${q} or case_ref ilike ${q} or detail ilike ${q})
    order by at desc
    limit ${limit}
  `;
  return rows.map((r) => ({
    key: r.key, direction: r.direction, channel: r.channel, contact: r.contact ?? 'Unknown', detail: r.detail, subject: r.subject,
    body: r.body, at: r.at, outcome: outcomeOf(r), note: r.note, error: r.error, attachment: r.attachment, caseRef: r.case_ref,
  }));
}

export async function messageLogCounts(): Promise<{ in: number; out: number; attention: number }> {
  const sql = getSql();
  const [row] = await sql<{ inbound: number; outbound: number; attention: number }[]>`
    select (select count(*)::int from inbound_messages) as inbound,
           (select count(*)::int from outbound_messages) as outbound,
           (select count(*)::int from inbound_messages where handled_at is null)
             + (select count(*)::int from outbound_messages where status = 'failed') as attention
  `;
  return { in: row.inbound, out: row.outbound, attention: row.attention };
}
