import { headers } from 'next/headers';
import AccessNotice from '@/components/AccessNotice';
import IntegrationsPanel from '@/components/settings/IntegrationsPanel';
import { timeAgo } from '@/components/lf/format';
import { listIntegrations } from '@/core/integrations';
import { recentInbound, SOURCE_LABELS } from '@/core/intake';
import { hasPermission } from '@/core/permissions';
import { getSessionUserFromCookies } from '@/core/session';
import { getSql } from '@/core/db';

export const dynamic = 'force-dynamic';

export default async function IntegrationsPage() {
  const user = await getSessionUserFromCookies();
  if (!user || !hasPermission(user, 'core:config')) return <AccessNotice area="Settings" />;

  const rows = await listIntegrations();
  const recent = await recentInbound(8);
  const sql = getSql();
  const refs = new Map((await sql<{ id: number; ref: string }[]>`select id, ref from cases where id = any(${recent.map((r) => r.case_id).filter((id): id is number => id !== null)})`).map((r) => [Number(r.id), r.ref]));
  const host = headers().get('x-forwarded-host') ?? headers().get('host') ?? 'localhost:3000';
  const proto = headers().get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https');
  const base = `${proto}://${host}`;

  const safe = Object.fromEntries(Object.entries(rows).map(([id, row]) => [id, {
    enabled: row.enabled,
    status: row.status,
    config: row.config,
    hasSecret: Boolean(row.secret),
    lastActivity: row.last_activity_at ? timeAgo(row.last_activity_at) : null,
    lastError: row.last_error,
    cursor: { lastRows: row.cursor.lastRows ?? null, columns: row.cursor.columns ?? null },
  }]));

  return (
    <main className="lf-page">
      <div className="lf-settings">
        <h1>Integrations</h1>
        <p>Where enquiries come from and how Forge replies. Messages from every source become quotes on their own.</p>
        <IntegrationsPanel
          rows={safe as never}
          whatsappEnv={{
            hasCredentials: Boolean(process.env.WHATSAPP_ACCESS_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID),
            phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID ? `…${process.env.WHATSAPP_PHONE_NUMBER_ID.slice(-4)}` : null,
          }}
          webhookUrl={`${base}/api/whatsapp/webhook`}
          intakeUrl={`${base}/api/intake/webhook`}
        />

        <section className="lf-form-section">
          <h2>Latest messages</h2>
          <p>Everything the integrations received, newest first.</p>
          {recent.length === 0 ? <p className="lf-none" style={{ marginTop: '0.75rem' }}>Nothing received yet.</p> : (
            <div className="lf-tasks" style={{ marginTop: '0.75rem' }}>
              {recent.map((m) => (
                <a key={m.id} className="lf-task" href={m.case_id && refs.get(Number(m.case_id)) ? `/sales?show=all&open=${refs.get(Number(m.case_id))}` : '#'}>
                  <span className="lf-chip">{SOURCE_LABELS[m.source]}</span>
                  <span className="lf-grow">{m.from_name ?? m.from_phone ?? m.from_email ?? 'Unknown'}: {m.body.replace(/\s+/g, ' ').slice(0, 90)}</span>
                  <span className="lf-dim">{m.case_id ? refs.get(Number(m.case_id)) : m.note ?? 'Not handled yet'}</span>
                  <span className="lf-dim">{timeAgo(m.received_at)}</span>
                </a>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
