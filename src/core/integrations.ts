import { getSql } from './db';
import { decryptSecret, encryptSecret } from './secrets';

// The integration records. Each connector module owns the logic for its own
// integration; this file only stores and reads the rows.

export type IntegrationId = 'whatsapp' | 'sheets' | 'webhook' | 'email';

export type IntegrationRow = {
  id: IntegrationId;
  enabled: boolean;
  config: Record<string, unknown>;
  secret: string | null;
  status: 'not_connected' | 'connected' | 'error';
  last_activity_at: string | null;
  last_error: string | null;
  cursor: Record<string, unknown>;
  updated_by: string | null;
  updated_at: string;
};

const EMPTY = (id: IntegrationId): IntegrationRow => ({
  id, enabled: false, config: {}, secret: null, status: 'not_connected', last_activity_at: null,
  last_error: null, cursor: {}, updated_by: null, updated_at: new Date(0).toISOString(),
});

export async function getIntegration(id: IntegrationId): Promise<IntegrationRow> {
  const sql = getSql();
  const rows = await sql<IntegrationRow[]>`select * from integrations where id = ${id}`;
  return rows[0] ?? EMPTY(id);
}

export async function listIntegrations(): Promise<Record<IntegrationId, IntegrationRow>> {
  const sql = getSql();
  const rows = await sql<IntegrationRow[]>`select * from integrations`;
  const byId = Object.fromEntries(rows.map((row) => [row.id, row])) as Partial<Record<IntegrationId, IntegrationRow>>;
  return {
    whatsapp: byId.whatsapp ?? EMPTY('whatsapp'),
    sheets: byId.sheets ?? EMPTY('sheets'),
    webhook: byId.webhook ?? EMPTY('webhook'),
    email: byId.email ?? EMPTY('email'),
  };
}

export function integrationSecret(row: IntegrationRow): string | null {
  return decryptSecret(row.secret);
}

export async function saveIntegration(
  id: IntegrationId,
  patch: { enabled?: boolean; config?: Record<string, unknown>; secret?: string | null; status?: IntegrationRow['status']; lastError?: string | null; cursor?: Record<string, unknown> },
  actorName: string,
): Promise<IntegrationRow> {
  const sql = getSql();
  const current = await getIntegration(id);
  const next = {
    enabled: patch.enabled ?? current.enabled,
    config: patch.config ?? current.config,
    secret: patch.secret === undefined ? current.secret : patch.secret === null ? null : encryptSecret(patch.secret),
    status: patch.status ?? current.status,
    last_error: patch.lastError === undefined ? current.last_error : patch.lastError,
    cursor: patch.cursor ?? current.cursor,
  };
  const [row] = await sql<IntegrationRow[]>`
    insert into integrations (id, enabled, config, secret, status, last_error, cursor, updated_by, updated_at)
    values (${id}, ${next.enabled}, ${sql.json(next.config as never)}, ${next.secret}, ${next.status},
            ${next.last_error}, ${sql.json(next.cursor as never)}, ${actorName}, now())
    on conflict (id) do update set
      enabled = excluded.enabled, config = excluded.config, secret = excluded.secret, status = excluded.status,
      last_error = excluded.last_error, cursor = excluded.cursor, updated_by = excluded.updated_by, updated_at = now()
    returning *
  `;
  return row;
}

/** Record a successful poll or delivery, or an error, without touching config. */
export async function markIntegration(id: IntegrationId, result: { ok: true } | { ok: false; error: string }) {
  const sql = getSql();
  if (result.ok) {
    await sql`update integrations set status = 'connected', last_error = null, last_activity_at = now() where id = ${id}`;
  } else {
    await sql`update integrations set status = 'error', last_error = ${result.error.slice(0, 500)} where id = ${id}`;
  }
}
