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
import { balanceOf, instalmentsOf, orderJob, paymentStatus, type OrderCase } from '@/modules/orders/order-job';
import { getOrderRules } from '@/modules/orders/order-settings';
import { termsLabel } from '@/modules/orders/payment-settings';
import RecordPaymentButton from '@/components/orders/RecordPaymentButton';
import { Chip } from '@/components/lf/Chips';
import { clock } from '@/components/lf/format';

export const dynamic = 'force-dynamic';

async function OrderSheet({ current, user, closeHref }: { current: OrderCase; user: SessionUser; closeHref: string }) {
  const [steps, stock, orderRules] = await Promise.all([
    getCaseSteps(current.id),
    productSource().get(current.data.lines.map((line) => line.sku)),
    getOrderRules(),
  ]);
  const instalments = instalmentsOf(current.data);
  const DOC_NAMES = { order_confirmation: 'Order confirmation', payment_request: 'Payment request', tax_invoice: 'Tax invoice' } as const;
  const bySku = new Map(stock.map((p) => [p.sku, p]));
  const can = new Set(availableSteps(orderJob, current.state, user).map((s) => s.name));
  const state = orderJob.states[current.state];
  const common = { job: 'order', caseId: current.id, version: current.version };
  const open = current.state === 'confirmed';
  const short = open && current.data.lines.some((line) => (bySku.get(line.sku)?.available ?? 0) < 0);
  const pay = paymentStatus(current.data, current.state);
  const balanceRupees = balanceOf(current.data) / 100;
  const payTone = pay.key === 'overdue' ? 'red' : pay.key === 'paid' ? 'green' : pay.key === 'due' ? 'amber' : 'grey';

  return (
    <Sheet closeHref={closeHref} label={<><span className="lf-ref">{current.ref}</span>{current.title}</>}>
      <div className="lf-sheet-title"><h2>{current.title}</h2></div>
      <div className="lf-sheet-sub">
        <StateChip state={current.state} label={state.label} />
        <span>{state.assignee ? `Waiting for ${ASSIGNEE_LABELS[state.assignee].toLowerCase()}` : state.terminal ? 'Closed' : 'Waiting for the buyer’s payment'}</span>
      </div>

      {current.data.attention && (
        <div className="lf-section">
          <div className="lf-review" data-tone="amber">
            <div className="lf-review-head"><Icon name="message" /><span className="lf-grow">{current.data.attention.reason}</span></div>
            <div className="lf-review-actions">
              {current.subject.phone && <a className="lf-btn" href={`https://wa.me/${current.subject.phone}`} target="_blank" rel="noreferrer"><Icon name="whatsapp" />Reply on WhatsApp</a>}
              {can.has('markHandled') && <StepButton {...common} step="markHandled" icon="check">Mark as handled</StepButton>}
            </div>
          </div>
        </div>
      )}

      {current.state === 'dispatched' && (
        <div className="lf-section">
          <div className="lf-review" data-tone={pay.key === 'overdue' ? 'amber' : undefined}>
            <div className="lf-review-head">
              <Icon name="upnext" />
              <span className="lf-grow">{formatPaise(pay.balancePaise)} to collect. {pay.label}. {pay.key === 'overdue' ? 'Forge keeps sending reminders.' : 'Forge sends the reminders.'}</span>
            </div>
            <div className="lf-review-actions">
              {can.has('recordPayment') && <RecordPaymentButton caseId={current.id} version={current.version} balanceRupees={balanceRupees} />}
            </div>
          </div>
        </div>
      )}

      {open && (
        <div className="lf-section">
          <div className="lf-review" data-tone={short ? 'amber' : undefined}>
            <div className="lf-review-head">
              <Icon name={short ? 'stock' : 'order'} />
              <span className="lf-grow">{short ? 'Some items are short. Check the stock before you promise a date.' : 'Made from the accepted quote. The stock is held for this order.'}</span>
            </div>
            <div className="lf-review-actions">
              {can.has('cancelOrder') && <PromptStepButton {...common} step="cancelOrder" field="reason" label="Why is it cancelled" title="Cancel order" icon="x" variant="ghost" confirmLabel="Cancel order">Cancel</PromptStepButton>}
              {can.has('recordPayment') && balanceRupees > 0 && <RecordPaymentButton caseId={current.id} version={current.version} balanceRupees={balanceRupees} variant="default" />}
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
        <dt><Icon name="check" />Payment</dt><dd><Chip tone={payTone}>{pay.label}</Chip>{pay.balancePaise > 0 && pay.key !== 'none' && <span className="lf-dim">&nbsp;{formatPaise(pay.balancePaise)} open</span>}</dd>
        <dt><Icon name="sliders" />Terms</dt><dd>{current.data.payment?.terms ? `${termsLabel(current.data.payment.terms)}${current.data.payment.terms.source !== 'default' ? ` (${current.data.payment.terms.source}'s own terms)` : ''}` : 'Pay after dispatch'}</dd>
        {orderRules.invoiceMode === 'tax_invoice' && (
          <><dt><Icon name="quote" />Buyer GSTIN</dt><dd>{current.data.buyerGstin ?? <span className="lf-dim">Not set</span>}{can.has('setBuyerGstin') && <>&nbsp;<PromptStepButton {...common} step="setBuyerGstin" field="gstin" required={false} label="Buyer GSTIN (15 characters)" title="Buyer GSTIN" variant="ghost" confirmLabel="Save">{current.data.buyerGstin ? 'Change' : 'Add'}</PromptStepButton></>}</dd></>
        )}
      </dl>

      <section className="lf-section">
        <div className="lf-section-head"><span>Payment schedule</span></div>
        <table className="lf-lines">
          <thead><tr><th>Payment</th><th>Due</th><th className="lf-num">Amount</th><th className="lf-num">Paid</th></tr></thead>
          <tbody>
            {instalments.map((i) => (
              <tr key={i.key}>
                <td>{i.label}</td>
                <td>{i.dueAt ? clock(i.dueAt).replace(/,.*$/, '') : i.trigger === 'dispatch' ? `${i.days} days after dispatch` : 'On confirmation'}</td>
                <td className="lf-num">{formatPaise(i.amountPaise)}</td>
                <td className="lf-num">{i.paidPaise >= i.amountPaise ? <Chip tone="green">Paid</Chip> : i.paidPaise ? formatPaise(i.paidPaise) : <span className="lf-dim">—</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {(current.data.documents?.length ?? 0) > 0 && (
        <section className="lf-section">
          <div className="lf-section-head"><span>Documents</span></div>
          <table className="lf-lines">
            <tbody>
              {current.data.documents!.map((d) => (
                <tr key={d.number}>
                  <td>{DOC_NAMES[d.kind]}<span className="lf-sku">{d.number}</span></td>
                  <td>{d.sent ? `Sent on ${d.channel === 'email' ? 'email' : 'WhatsApp'}` : <span className="lf-error">Not sent</span>}</td>
                  <td className="lf-dim">{clock(d.at)}</td>
                  <td className="lf-num"><a className="lf-btn lf-btn-ghost" href={`/api/jobs/order/cases/${current.id}/documents?number=${encodeURIComponent(d.number)}`} target="_blank" rel="noreferrer"><Icon name="download" />PDF</a></td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

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

      {(current.data.payment?.payments.length ?? 0) > 0 && (
        <section className="lf-section">
          <div className="lf-section-head"><span>Payments</span></div>
          <table className="lf-lines">
            <thead><tr><th>Received</th><th>By</th><th>Reference</th><th className="lf-num">Amount</th></tr></thead>
            <tbody>
              {current.data.payment!.payments.map((p, i) => (
                <tr key={i}><td>{clock(p.at)}</td><td>{p.mode}</td><td>{p.reference ?? '—'}</td><td className="lf-num">{formatPaise(p.amountPaise)}</td></tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

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
                <th><span className="lf-th"><Icon name="check" />Payment</span></th>
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
                  <td>{(() => { const p = paymentStatus(row.data, row.state); return <Chip tone={p.key === 'overdue' ? 'red' : p.key === 'paid' ? 'green' : p.key === 'due' ? 'amber' : 'grey'}>{p.label}</Chip>; })()}</td>
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
