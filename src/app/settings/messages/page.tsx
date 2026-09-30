import Link from 'next/link';
import AccessNotice from '@/components/AccessNotice';
import ClickRow from '@/components/lf/ClickRow';
import { Chip, SourceLabel, type Tone } from '@/components/lf/Chips';
import Hint from '@/components/lf/Hint';
import Icon from '@/components/lf/Icon';
import PageBar from '@/components/lf/PageBar';
import Sheet from '@/components/lf/Sheet';
import { timeAgo } from '@/components/lf/format';
import SetupNotice from '@/components/SetupNotice';
import { SOURCE_LABELS, type IntakeSource } from '@/core/intake';
import { messageLog, messageLogCounts, type LogEntry, type LogFilter, type LogOutcome } from '@/core/message-log';
import { hasPermission } from '@/core/permissions';
import { getSessionUserFromCookies } from '@/core/session';

export const dynamic = 'force-dynamic';

const OUTCOMES: Record<LogOutcome, { label: string; tone: Tone }> = {
  created: { label: 'New enquiry', tone: 'violet' },
  added: { label: 'Added to record', tone: 'blue' },
  waiting: { label: 'Not handled', tone: 'amber' },
  sent: { label: 'Sent', tone: 'green' },
  test: { label: 'Test send', tone: 'grey' },
  failed: { label: 'Failed', tone: 'red' },
};

const CHANNELS = ['whatsapp', 'email', 'sheets', 'webhook'] as const;

const recordPath = (ref: string) => (ref.startsWith('SO-') ? `/orders?show=all&open=${ref}` : ref.startsWith('PO-') ? `/purchasing?view=all&open=${ref}` : `/sales?show=all&open=${ref}`);

const channelLabel = (c: string) => SOURCE_LABELS[c as IntakeSource] ?? c;

function when(at: string) {
  return new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' }).format(new Date(at));
}

function EntrySheet({ entry, closeHref }: { entry: LogEntry; closeHref: string }) {
  const outcome = OUTCOMES[entry.outcome];
  return (
    <Sheet closeHref={closeHref} label={<>{entry.direction === 'in' ? 'Received' : 'Sent'} · {channelLabel(entry.channel)}</>}>
      <div className="lf-sheet-title"><h2>{entry.contact}</h2></div>
      <div className="lf-sheet-sub"><Chip tone={outcome.tone}>{outcome.label}</Chip><span>{when(entry.at)} · {timeAgo(entry.at)}</span></div>
      <dl className="ml-facts">
        <dt>Direction</dt><dd>{entry.direction === 'in' ? 'Received by Forge' : 'Sent by Forge'}</dd>
        <dt>Channel</dt><dd><SourceLabel source={entry.channel} label={channelLabel(entry.channel)} /></dd>
        {entry.detail && <><dt>{entry.direction === 'in' ? 'From' : 'To'}</dt><dd>{entry.detail}</dd></>}
        {entry.subject && <><dt>Subject</dt><dd>{entry.subject}</dd></>}
        {entry.attachment && <><dt>Attachment</dt><dd>{entry.attachment}</dd></>}
        <dt>Record</dt><dd>{entry.caseRef ? <Link className="lf-row-link" href={recordPath(entry.caseRef)}>{entry.caseRef}</Link> : <span className="lf-dim">None</span>}</dd>
        {entry.note && <><dt>What Forge did</dt><dd>{entry.note}</dd></>}
      </dl>
      {entry.error && (
        <div className="lf-section">
          <div className="lf-review" data-tone="red"><div className="lf-review-head"><Icon name="x" /><span className="lf-grow">{entry.error}</span></div></div>
        </div>
      )}
      <section className="lf-section">
        <div className="lf-section-head"><span>Message</span></div>
        <p className="ml-body">{entry.body}</p>
      </section>
    </Sheet>
  );
}

export default async function MessageLogPage({ searchParams }: { searchParams: { view?: string; channel?: string; q?: string; open?: string } }) {
  const user = await getSessionUserFromCookies();
  if (!user || !hasPermission(user, 'core:config')) return <AccessNotice area="Settings" />;

  const view = (['in', 'out', 'attention'] as const).find((v) => v === searchParams.view) ?? 'all';
  const channel = CHANNELS.find((c) => c === searchParams.channel) ?? null;
  const q = searchParams.q?.trim() || null;
  const filter: LogFilter = { view, channel, q };

  const href = (next: Partial<{ view: string; channel: string | null; q: string | null; open: string | null }>) => {
    const p = new URLSearchParams();
    const v = next.view ?? view;
    const c = next.channel === undefined ? channel : next.channel;
    const s = next.q === undefined ? q : next.q;
    if (v !== 'all') p.set('view', v);
    if (c) p.set('channel', c);
    if (s) p.set('q', s);
    if (next.open) p.set('open', next.open);
    const qs = p.toString();
    return `/settings/messages${qs ? `?${qs}` : ''}`;
  };

  let entries: LogEntry[];
  let counts: Awaited<ReturnType<typeof messageLogCounts>>;
  try {
    [entries, counts] = await Promise.all([messageLog(filter), messageLogCounts()]);
  } catch (error) {
    return <SetupNotice message={error instanceof Error ? error.message : String(error)} />;
  }
  const selected = searchParams.open ? entries.find((e) => e.key === searchParams.open) ?? null : null;

  return (
    <main className="lf-page">
      <PageBar
        icon="inbox"
        title="Message log"
        description="Every message Forge received or sent on your connections, and what Forge did with it. Newest first."
        views={[
          { label: 'All', href: href({ view: 'all' }), current: view === 'all' },
          { label: 'Received', href: href({ view: 'in' }), current: view === 'in', count: counts.in },
          { label: 'Sent', href: href({ view: 'out' }), current: view === 'out', count: counts.out },
          { label: 'Needs a look', href: href({ view: 'attention' }), current: view === 'attention', count: counts.attention },
        ]}
      />
      <div className="ml-filters">
        <form action="/settings/messages" className="ml-search">
          {view !== 'all' && <input type="hidden" name="view" value={view} />}
          {channel && <input type="hidden" name="channel" value={channel} />}
          <Icon name="search" size={14} />
          <input name="q" defaultValue={q ?? ''} placeholder="Search name, message or record" aria-label="Search messages" />
        </form>
        <div className="ml-chips" role="group" aria-label="Channel">
          <Link className="ml-chip" aria-current={!channel ? 'true' : undefined} href={href({ channel: null })}>Any channel</Link>
          {CHANNELS.map((c) => (
            <Link key={c} className="ml-chip" aria-current={channel === c ? 'true' : undefined} href={href({ channel: c })}>
              <SourceLabel source={c} label={channelLabel(c)} />
            </Link>
          ))}
        </div>
      </div>

      {entries.length === 0 ? (
        <div className="lf-empty"><strong>No messages</strong>{q || channel || view !== 'all' ? 'Nothing matches these filters.' : 'Messages appear here when a connection receives or sends one.'}</div>
      ) : (
        <div className="lf-table-wrap">
          <table className="lf-table ml-table">
            <thead><tr><th>Time</th><th aria-label="Direction" /><th>Channel</th><th>Contact</th><th>Message</th><th>Result<Hint term="result" label="Result" /></th><th>Record</th></tr></thead>
            <tbody>
              {entries.map((e) => {
                const open = href({ open: e.key });
                return (
                  <ClickRow key={e.key} href={open} selected={selected?.key === e.key}>
                    <td className="lf-dim ml-time"><a className="ml-time-link" href={open} title={when(e.at)}>{timeAgo(e.at)}</a></td>
                    <td className="ml-dir" title={e.direction === 'in' ? 'Received' : 'Sent'}><Icon name={e.direction === 'in' ? 'inbox' : 'send'} size={14} /></td>
                    <td><SourceLabel source={e.channel} label={channelLabel(e.channel)} /></td>
                    <td className="ml-contact">{e.contact}</td>
                    <td className="ml-msg">{e.subject ? <strong>{e.subject} · </strong> : null}{e.body.replace(/\s+/g, ' ')}</td>
                    <td><Chip tone={OUTCOMES[e.outcome].tone}>{OUTCOMES[e.outcome].label}</Chip></td>
                    <td>{e.caseRef ? <Link className="lf-ref" href={recordPath(e.caseRef)}>{e.caseRef}</Link> : <span className="lf-dim">—</span>}</td>
                  </ClickRow>
                );
              })}
            </tbody>
          </table>
          <div className="lf-count-foot">{entries.length === 100 ? 'Latest 100 shown. Search to find older messages.' : `${entries.length} count`}</div>
        </div>
      )}
      {selected && <EntrySheet entry={selected} closeHref={href({ open: null })} />}
    </main>
  );
}
