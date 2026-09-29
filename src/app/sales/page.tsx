import Link from 'next/link';
import AccessNotice from '@/components/AccessNotice';
import ForgeShell from '@/components/ForgeShell';
import CaseList from '@/components/jobs/CaseList';
import SetupNotice from '@/components/SetupNotice';
import { listCases, type CaseRecord } from '@/core/jobs';
import { formatPaise } from '@/core/money';
import { guardModulePage } from '@/core/page-guard';
import { hasPermission } from '@/core/permissions';
import { CHANNEL_LABELS, quoteJob, type QuoteData } from '@/modules/sales/quote-job';

export const dynamic = 'force-dynamic';

export default async function SalesPage({ searchParams }: { searchParams: { show?: string } }) {
  const user = await guardModulePage('sales', 'sales:read');
  if (!user) return <AccessNotice area="Sales" />;
  const showAll = searchParams.show === 'all';

  let rows: CaseRecord[];
  try {
    rows = await listCases({ job: 'quote', openOnly: !showAll });
  } catch (error) {
    return <SetupNotice message={error instanceof Error ? error.message : String(error)} />;
  }

  return (
    <ForgeShell
      activeArea="sales"
      title="Enquiries and quotes"
      description="Each enquiry becomes one quote case. Prices come from the catalogue rules, and quotes above the limit wait for an approver."
      actions={hasPermission(user, 'sales:write')
        ? <Link href="/sales/new" className="ui-button ui-button-primary ui-button-medium"><span>New enquiry</span></Link>
        : undefined}
    >
      <section className="job-panel">
        <header className="job-panel-head">
          <div className="job-filter" role="group" aria-label="Show">
            <Link href="/sales" aria-current={!showAll ? 'page' : undefined}>Open</Link>
            <Link href="/sales?show=all" aria-current={showAll ? 'page' : undefined}>All</Link>
          </div>
          <span className="job-count">{rows.length}</span>
        </header>
        <CaseList
          rows={rows}
          defs={{ quote: quoteJob }}
          hrefFor={(row) => `/sales/${row.ref}`}
          columns={[
            { label: 'Came by', render: (row) => CHANNEL_LABELS[(row.data as QuoteData).enquiry?.channel] ?? '—' },
            {
              label: 'Total',
              className: 'job-num',
              render: (row) => {
                const quote = (row.data as QuoteData).quote;
                return quote ? formatPaise(quote.totalPaise) : <span className="job-dim">No quote yet</span>;
              },
            },
          ]}
          empty={showAll ? 'No enquiries yet.' : 'No open enquiries. Record a new one when a buyer asks for a price.'}
        />
      </section>
    </ForgeShell>
  );
}
