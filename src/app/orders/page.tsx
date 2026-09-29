import Link from 'next/link';
import AccessNotice from '@/components/AccessNotice';
import ClickRow from '@/components/lf/ClickRow';
import Icon from '@/components/lf/Icon';
import PageBar from '@/components/lf/PageBar';
import Sheet from '@/components/lf/Sheet';
import { StateChip } from '@/components/lf/Chips';
import { displayPhone, timeAgo } from '@/components/lf/format';
import { PromptStepButton, StepButton } from '@/components/jobs/StepControls';
import SetupNotice from '@/components/SetupNotice';
import { ASSIGNEE_LABELS, availableSteps, getCaseByRef, getCaseSteps, listCases } from '@/core/jobs';
import { formatPaise } from '@/core/money';
import { guardModulePage } from '@/core/page-guard';
import { productSource } from '@/core/products';
import type { SessionUser } from '@/core/users';
import '@/modules/jobs';
import { orderJob, type OrderCase } from '@/modules/orders/order-job';

export const dynamic = 'force-dynamic';

async function OrderSheet({ current, user, closeHref }: { current: OrderCase; user: SessionUser; closeHref: string }) {
  const [steps, stock] = await Promise.all([
    getCaseSteps(current.id),
    productSource().get(current.data.lines.map((line) => line.sku)),
  ]);
  const bySku = new Map(stock.map((p) => [p.sku, p]));
  const can = new Set(availableSteps(orderJob, current.state, user).map((s) => s.name));
  const state = orderJob.states[current.state];
  const common = { job: 'order', caseId: current.id, version: current.version };
  const open = current.state === 'confirmed';
  const short = open && current.data.lines.some((line) => (bySku.get(line.sku)?.available ?? 0) < 0);

  return (
    <Sheet closeHref={closeHref} label={<><span className="lf-ref">{current.ref}</span>{current.title}</>}>
      <div className="lf-sheet-title"><h2>{current.title}</h2></div>
      <div className="lf-sheet-sub">
        <StateChip state={current.state} label={state.label} />
        <span>{state.assignee ? `Waiting for ${ASSIGNEE_LABELS[state.assignee].toLowerCase()}` : 'Closed'}</span>
      </div>

      {open && (
        <div className="lf-section">
          <div className="lf-review" data-tone={short ? 'amber' : undefined}>
            <div className="lf-review-head">
              <Icon name={short ? 'stock' : 'order'} />
              <span className="lf-grow">{short ? 'Some items are short. Check the stock before you promise a date.' : 'Made from the accepted quote. The stock is held for this order.'}</span>
            </div>
            <div className="lf-review-actions">
              {can.has('cancelOrder') && <PromptStepButton {...common} step="cancelOrder" field="reason" label="Why is it cancelled" title="Cancel order" icon="x" variant="ghost" confirmLabel="Cancel order">Cancel</PromptStepButton>}
              {can.has('dispatchOrder') && <PromptStepButton {...common} step="dispatchOrder" field="vehicle" required={false} label="Vehicle number (optional)" title="Mark as dispatched" icon="order" variant="primary" confirmLabel="Dispatch">Mark as dispatched</PromptStepButton>}
            </div>
          </div>
        </div>
      )}

      <dl className="lf-props">
        <dt><Icon name="person" />Buyer</dt><dd>{current.subject.buyerName}</dd>
        <dt><Icon name="phone" />Phone</dt><dd className={current.subject.phone ? '' : 'lf-dim'}>{displayPhone(current.subject.phone) ?? 'No phone'}</dd>
        <dt><Icon name="quote" />From quote</dt><dd><Link className="lf-row-link" href={`/sales?show=all&open=${current.data.quoteRef}`}>{current.data.quoteRef}</Link>&nbsp;<span className="lf-dim">v{current.data.quoteVersion}</span></dd>
        <dt><Icon name="edit" />Buyer PO</dt><dd className={current.data.buyerPo ? '' : 'lf-dim'}>{current.data.buyerPo ?? 'None'}</dd>
        <dt><Icon name="stock" />Deliver to</dt><dd>{current.data.pincode}</dd>
      </dl>

      <section className="lf-section">
        <div className="lf-section-head"><span>Items</span></div>
        <table className="lf-lines">
          <thead><tr><th>Item</th><th className="lf-num">Quantity</th><th className="lf-num">Amount</th>{open && <th className="lf-num">Free after this order</th>}</tr></thead>
          <tbody>
            {current.data.lines.map((line) => {
              const product = bySku.get(line.sku);
              return (
                <tr key={line.sku}>
                  <td>{line.name}<span className="lf-sku">{line.sku}</span></td>
                  <td className="lf-num">{line.quantity.toLocaleString('en-IN')} {line.unit}</td>
                  <td className="lf-num">{formatPaise(line.amountPaise)}</td>
                  {open && <td className="lf-num">{product ? <span className={product.available < 0 ? 'lf-error' : undefined}>{product.available.toLocaleString('en-IN')}</span> : '—'}</td>}
                </tr>
              );
            })}
          </tbody>
        </table>
        <dl className="lf-totals">
          <dt>Items</dt><dd>{formatPaise(current.data.subtotalPaise)}</dd>
          <dt>GST</dt><dd>{formatPaise(current.data.gstPaise)}</dd>
          <dt>Freight</dt><dd>{formatPaise(current.data.freightPaise)}</dd>
          <dt className="lf-total">Total</dt><dd className="lf-total">{formatPaise(current.data.totalPaise)}</dd>
        </dl>
      </section>

      <section className="lf-section">
        <div className="lf-section-head"><span>Activity</span></div>
        <div className="lf-feed">
          {[...steps].reverse().map((step) => (
            <div key={step.id} className="lf-feed-item">
              <Icon name={step.actor_kind === 'user' ? 'person' : 'bolt'} />
              <span>{step.summary} <span className="lf-feed-time">{step.actor_name} · {timeAgo(step.created_at)}</span></span>
            </div>
          ))}
        </div>
      </section>
    </Sheet>
  );
}

export default async function OrdersPage({ searchParams }: { searchParams: { show?: string; open?: string } }) {
  const user = await guardModulePage('orders', 'orders:read');
  if (!user) return <AccessNotice area="Orders" />;
  const showAll = searchParams.show === 'all';
  const base = showAll ? '/orders?show=all' : '/orders';
  const join = base.includes('?') ? '&' : '?';

  let rows: OrderCase[];
  let selected: OrderCase | null = null;
  try {
    rows = await listCases({ job: 'order', openOnly: !showAll }) as OrderCase[];
    if (searchParams.open) {
      const found = await getCaseByRef(searchParams.open);
      if (found?.job === 'order') selected = found as OrderCase;
    }
  } catch (error) {
    return <SetupNotice message={error instanceof Error ? error.message : String(error)} />;
  }

  return (
    <main className="lf-page">
      <PageBar icon="order" title="Orders" description="Orders made from accepted quotes, with the same items and prices. Confirmed orders hold stock until dispatch."
        views={[{ label: 'Open', href: '/orders', current: !showAll, count: showAll ? undefined : rows.length }, { label: 'All', href: '/orders?show=all', current: showAll, count: showAll ? rows.length : undefined }]} />
      {rows.length === 0 ? (
        <div className="lf-empty"><strong>No {showAll ? '' : 'open '}orders</strong>An order appears here when a buyer accepts a quote.</div>
      ) : (
        <div className="lf-table-wrap">
          <table className="lf-table">
            <thead>
              <tr>
                <th><span className="lf-th"><Icon name="order" />Order</span></th>
                <th><span className="lf-th"><Icon name="dot" />Status</span></th>
                <th><span className="lf-th"><Icon name="quote" />From quote</span></th>
                <th><span className="lf-th"><Icon name="stock" />Items</span></th>
                <th className="lf-num"><span className="lf-th">Total</span></th>
                <th><span className="lf-th"><Icon name="upnext" />Last activity</span></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <ClickRow key={row.id} href={`${base}${join}open=${row.ref}`} selected={selected?.id === row.id}>
                  <td><span className="lf-ref">{row.ref}</span><a className="lf-row-link" href={`${base}${join}open=${row.ref}`}>{row.title}</a></td>
                  <td><StateChip state={row.state} label={orderJob.states[row.state].label} /></td>
                  <td>{row.data.quoteRef}</td>
                  <td>{row.data.lines.map((l) => `${l.quantity.toLocaleString('en-IN')} × ${l.name}`).join(', ')}</td>
                  <td className="lf-num">{formatPaise(row.data.totalPaise)}</td>
                  <td className="lf-dim">{timeAgo(row.updated_at)}</td>
                </ClickRow>
              ))}
            </tbody>
          </table>
          <div className="lf-count-foot">{rows.length} count</div>
        </div>
      )}
      {selected && <OrderSheet current={selected} user={user} closeHref={base} />}
    </main>
  );
}
