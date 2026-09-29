import Link from 'next/link';
import { notFound } from 'next/navigation';
import AccessNotice from '@/components/AccessNotice';
import ForgeShell from '@/components/ForgeShell';
import CaseTimeline from '@/components/jobs/CaseTimeline';
import StateBadge from '@/components/jobs/StateBadge';
import OrderActions from '@/components/orders/OrderActions';
import SetupNotice from '@/components/SetupNotice';
import { ASSIGNEE_LABELS, availableSteps, getCaseById, getCaseByRef, getCaseSteps } from '@/core/jobs';
import { formatPaise } from '@/core/money';
import { guardModulePage } from '@/core/page-guard';
import { productSource } from '@/core/products';
import { casePath } from '@/modules/jobs';
import { orderJob, type OrderCase } from '@/modules/orders/order-job';

export const dynamic = 'force-dynamic';

export default async function OrderCasePage({ params }: { params: { ref: string } }) {
  const user = await guardModulePage('orders', 'orders:read');
  if (!user) return <AccessNotice area="Orders" />;

  try {
    const found = await getCaseByRef(params.ref);
    if (!found || found.job !== 'order') notFound();
    const current = found as OrderCase;
    const [steps, stock, parent] = await Promise.all([
      getCaseSteps(current.id),
      productSource().get(current.data.lines.map((line) => line.sku)),
      current.parent_case_id ? getCaseById(current.parent_case_id) : Promise.resolve(null),
    ]);
    const stockBySku = new Map(stock.map((product) => [product.sku, product]));
    const state = orderJob.states[current.state];
    const stepNames = availableSteps(orderJob, current.state, user).map((step) => step.name);
    const open = current.state === 'confirmed';

    return (
      <ForgeShell
        activeArea="orders"
        title={`${current.ref} · ${current.title}`}
        description={state.assignee ? `Waiting for ${ASSIGNEE_LABELS[state.assignee].toLowerCase()}.` : 'Closed.'}
        status={<div className="job-heading-meta"><StateBadge def={orderJob} state={current.state} /></div>}
        actions={<Link href="/orders" className="crm-view-link">All orders</Link>}
      >
        <div className="job-case">
          <div className="job-case-main">
            <section className="job-panel">
              <header className="job-panel-head">
                <h2>Order lines</h2>
                {parent && <span className="job-dim">From <Link href={casePath(parent.job, parent.ref)} className="job-ref">{parent.ref}</Link> v{current.data.quoteVersion}</span>}
              </header>
              <dl className="job-facts">
                <div><dt>Buyer</dt><dd>{current.subject.buyerName}</dd></div>
                {current.subject.company && <div><dt>Company</dt><dd>{current.subject.company}</dd></div>}
                {current.data.buyerPo && <div><dt>Buyer PO</dt><dd>{current.data.buyerPo}</dd></div>}
                <div><dt>Deliver to</dt><dd>{current.data.pincode}</dd></div>
              </dl>
              <div className="job-table-wrap">
                <table className="job-table">
                  <thead>
                    <tr>
                      <th>Item</th><th className="job-num">Quantity</th><th className="job-num">Amount</th>
                      {open && <th className="job-num">Free stock after this order</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {current.data.lines.map((line) => {
                      const product = stockBySku.get(line.sku);
                      return (
                        <tr key={line.sku}>
                          <td>{line.name}<span className="job-sku">{line.sku}</span></td>
                          <td className="job-num">{line.quantity.toLocaleString('en-IN')} {line.unit}</td>
                          <td className="job-num">{formatPaise(line.amountPaise)}</td>
                          {open && (
                            <td className="job-num">
                              {product
                                ? <span className={product.available < 0 ? 'job-short' : undefined}>
                                    {product.available.toLocaleString('en-IN')} {product.unit}
                                    {product.available < 0 && ' short'}
                                  </span>
                                : '—'}
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <dl className="job-totals">
                <div><dt>Items</dt><dd>{formatPaise(current.data.subtotalPaise)}</dd></div>
                <div><dt>GST</dt><dd>{formatPaise(current.data.gstPaise)}</dd></div>
                <div><dt>Freight</dt><dd>{formatPaise(current.data.freightPaise)}</dd></div>
                <div className="job-total"><dt>Total</dt><dd>{formatPaise(current.data.totalPaise)}</dd></div>
              </dl>
            </section>
            <OrderActions caseId={current.id} version={current.version} steps={stepNames} />
          </div>
          <aside className="job-panel job-case-side">
            <header className="job-panel-head"><h2>Timeline</h2></header>
            <CaseTimeline steps={steps} def={orderJob} />
          </aside>
        </div>
      </ForgeShell>
    );
  } catch (error) {
    if (error && typeof error === 'object' && 'digest' in error) throw error;
    return <SetupNotice message={error instanceof Error ? error.message : String(error)} />;
  }
}
