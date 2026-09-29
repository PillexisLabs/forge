import AccessNotice from '@/components/AccessNotice';
import ClickRow from '@/components/lf/ClickRow';
import Icon from '@/components/lf/Icon';
import PageBar from '@/components/lf/PageBar';
import { Chip, SourceLabel, StateChip } from '@/components/lf/Chips';
import { timeAgo } from '@/components/lf/format';
import NewEnquiryButton from '@/components/sales/NewEnquiryButton';
import QuoteSheet from '@/components/sales/QuoteSheet';
import SetupNotice from '@/components/SetupNotice';
import { getCaseByRef, listCases } from '@/core/jobs';
import { formatPaise } from '@/core/money';
import { guardModulePage } from '@/core/page-guard';
import { hasPermission } from '@/core/permissions';
import '@/modules/jobs';
import { CHANNEL_LABELS, quoteJob, type QuoteCase } from '@/modules/sales/quote-job';

export const dynamic = 'force-dynamic';

function itemsSummary(row: QuoteCase): string {
  const lines = row.data.quote?.lines ?? [];
  if (!lines.length) return '';
  const first = `${lines[0].quantity.toLocaleString('en-IN')} × ${lines[0].name}`;
  return lines.length > 1 ? `${first} +${lines.length - 1}` : first;
}

function needs(row: QuoteCase) {
  if (row.data.attention) return <Chip tone="amber">Buyer wrote</Chip>;
  if (row.state === 'draft' && row.data.draftedBy === 'rule') return <Chip tone="blue">Check draft</Chip>;
  if (row.state === 'enquiry' && row.data.awaiting?.length) return <span className="lf-dim">Asked for {row.data.awaiting.join(', ')}</span>;
  if (row.state === 'enquiry') return <Chip tone="amber">Match items</Chip>;
  if (row.state === 'awaiting_approval') return <Chip tone="amber">Approve</Chip>;
  if (row.state === 'approved') return <Chip tone="blue">Send</Chip>;
  return null;
}

export default async function SalesPage({ searchParams }: { searchParams: { show?: string; open?: string } }) {
  const user = await guardModulePage('sales', 'sales:read');
  if (!user) return <AccessNotice area="Quotes" />;
  const showAll = searchParams.show === 'all';
  const base = showAll ? '/sales?show=all' : '/sales';
  const join = base.includes('?') ? '&' : '?';

  let rows: QuoteCase[];
  let selected: QuoteCase | null = null;
  try {
    rows = await listCases({ job: 'quote', openOnly: !showAll }) as QuoteCase[];
    if (searchParams.open) {
      const found = await getCaseByRef(searchParams.open);
      if (found?.job === 'quote') selected = found as QuoteCase;
    }
  } catch (error) {
    return <SetupNotice message={error instanceof Error ? error.message : String(error)} />;
  }

  return (
    <main className="lf-page">
      <PageBar
        icon="quote"
        title="Quotes"
        views={[{ label: 'Open', href: '/sales', current: !showAll }, { label: 'All', href: '/sales?show=all', current: showAll }]}
        actions={hasPermission(user, 'sales:write') ? <NewEnquiryButton /> : undefined}
      />
      {rows.length === 0 ? (
        <div className="lf-empty">
          <strong>No {showAll ? '' : 'open '}quotes</strong>
          Enquiries from WhatsApp, Google Sheets, the webhook and email appear here on their own. Connect them in Settings → Integrations.
        </div>
      ) : (
        <div className="lf-table-wrap">
          <table className="lf-table">
            <thead>
              <tr>
                <th><span className="lf-th"><Icon name="quote" />Quote</span></th>
                <th><span className="lf-th"><Icon name="dot" />Status</span></th>
                <th><span className="lf-th"><Icon name="bolt" />Next</span></th>
                <th><span className="lf-th"><Icon name="plug" />Source</span></th>
                <th><span className="lf-th"><Icon name="stock" />Items</span></th>
                <th className="lf-num"><span className="lf-th">Total</span></th>
                <th><span className="lf-th"><Icon name="upnext" />Last activity</span></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <ClickRow key={row.id} href={`${base}${join}open=${row.ref}`} selected={selected?.id === row.id}>
                  <td><span className="lf-ref">{row.ref}</span><a className="lf-row-link" href={`${base}${join}open=${row.ref}`}>{row.title}</a></td>
                  <td><StateChip state={row.state} label={quoteJob.states[row.state].label} /></td>
                  <td>{needs(row)}</td>
                  <td><SourceLabel source={row.data.enquiry.channel} label={CHANNEL_LABELS[row.data.enquiry.channel]} /></td>
                  <td>{itemsSummary(row) || <span className="lf-dim">Not matched yet</span>}</td>
                  <td className="lf-num">{row.data.quote ? formatPaise(row.data.quote.totalPaise) : <span className="lf-dim">—</span>}</td>
                  <td className="lf-dim">{timeAgo(row.updated_at)}</td>
                </ClickRow>
              ))}
            </tbody>
          </table>
          <div className="lf-count-foot">{rows.length} count</div>
        </div>
      )}
      {selected && <QuoteSheet current={selected} user={user} closeHref={base} />}
    </main>
  );
}
