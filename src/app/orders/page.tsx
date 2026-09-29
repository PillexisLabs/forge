import Link from 'next/link';
import AccessNotice from '@/components/AccessNotice';
import ForgeShell from '@/components/ForgeShell';
import CaseList from '@/components/jobs/CaseList';
import SetupNotice from '@/components/SetupNotice';
import { listCases, type CaseRecord } from '@/core/jobs';
import { formatPaise } from '@/core/money';
import { guardModulePage } from '@/core/page-guard';
import { orderJob, type OrderData } from '@/modules/orders/order-job';

export const dynamic = 'force-dynamic';

export default async function OrdersPage({ searchParams }: { searchParams: { show?: string } }) {
  const user = await guardModulePage('orders', 'orders:read');
  if (!user) return <AccessNotice area="Orders" />;
  const showAll = searchParams.show === 'all';

  let rows: CaseRecord[];
  try {
    rows = await listCases({ job: 'order', openOnly: !showAll });
  } catch (error) {
    return <SetupNotice message={error instanceof Error ? error.message : String(error)} />;
  }

  return (
    <ForgeShell
      activeArea="orders"
      title="Orders"
      description="Orders are made from accepted quotes, with the same items and prices. Confirmed orders hold stock until dispatch."
    >
      <section className="job-panel">
        <header className="job-panel-head">
          <div className="job-filter" role="group" aria-label="Show">
            <Link href="/orders" aria-current={!showAll ? 'page' : undefined}>Open</Link>
            <Link href="/orders?show=all" aria-current={showAll ? 'page' : undefined}>All</Link>
          </div>
          <span className="job-count">{rows.length}</span>
        </header>
        <CaseList
          rows={rows}
          defs={{ order: orderJob }}
          hrefFor={(row) => `/orders/${row.ref}`}
          columns={[
            { label: 'From quote', render: (row) => (row.data as OrderData).quoteRef },
            { label: 'Total', className: 'job-num', render: (row) => formatPaise((row.data as OrderData).totalPaise) },
          ]}
          empty={showAll ? 'No orders yet.' : 'No open orders. An order appears here when a buyer accepts a quote.'}
        />
      </section>
    </ForgeShell>
  );
}
