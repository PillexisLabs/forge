import { headers } from 'next/headers';
import Link from 'next/link';
import AccessNotice from '@/components/AccessNotice';
import IntegrationsPanel from '@/components/settings/IntegrationsPanel';
import SettingsHeader from '@/components/settings/SettingsHeader';
import { timeAgo } from '@/components/lf/format';
import Icon from '@/components/lf/Icon';
import { listIntegrations } from '@/core/integrations';
import { recentInbound } from '@/core/intake';
import { messageLogCounts } from '@/core/message-log';
import { hasPermission } from '@/core/permissions';
import { getSessionUserFromCookies } from '@/core/session';

export const dynamic = 'force-dynamic';


export default async function IntegrationsPage() {
  const user = await getSessionUserFromCookies();
  if (!user || !hasPermission(user, 'core:config')) return <AccessNotice area="Settings" />;

  const rows = await listIntegrations();
  const counts = await messageLogCounts();
  const latest = (await recentInbound(1))[0]?.received_at ?? null;
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
      <div className="st st-stack" data-wide="true">
        <SettingsHeader title="Integrations" description="Where enquiries come from and how Forge replies. Messages from every source become quotes on their own." />
        <IntegrationsPanel
          rows={safe as never}
          whatsappEnv={{
            hasCredentials: Boolean(process.env.WHATSAPP_ACCESS_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID),
            phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID ? `…${process.env.WHATSAPP_PHONE_NUMBER_ID.slice(-4)}` : null,
          }}
          webhookUrl={`${base}/api/whatsapp/webhook`}
          intakeUrl={`${base}/api/intake/webhook`}
        />

        <section className="st-card">
          <div className="st-list-row">
            <span className="lf-connector-logo"><Icon name="inbox" size={18} /></span>
            <span className="st-list-text st-wrap">
              <strong>Message log</strong>
              <span>{counts.in.toLocaleString('en-IN')} received and {counts.out.toLocaleString('en-IN')} sent{counts.attention ? `. ${counts.attention} need a look.` : '. Nothing needs a look.'}{latest ? ` Last message ${timeAgo(latest)}.` : ''}</span>
            </span>
            <Link className="lf-btn" href={counts.attention ? '/settings/messages?view=attention' : '/settings/messages'}>Open log</Link>
          </div>
        </section>
      </div>
    </main>
  );
}
