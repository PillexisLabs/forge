import Link from 'next/link';
import AccessNotice from '@/components/AccessNotice';
import { PromptStepButton } from '@/components/jobs/StepControls';
import ClickRow from '@/components/lf/ClickRow';
import { StateChip } from '@/components/lf/Chips';
import Icon from '@/components/lf/Icon';
import PageBar from '@/components/lf/PageBar';
import Sheet from '@/components/lf/Sheet';
import { timeAgo } from '@/components/lf/format';
import ApprovePo from '@/components/purchasing/ApprovePo';
import SupplierModal from '@/components/purchasing/SupplierModal';
import SetupNotice from '@/components/SetupNotice';
import { availableSteps, getCaseByRef, getCaseSteps, listCases } from '@/core/jobs';
import { guardModulePage } from '@/core/page-guard';
import { hasPermission } from '@/core/permissions';
import { productSource } from '@/core/products';
import type { SessionUser } from '@/core/users';
import '@/modules/jobs';
import { purchaseJob, type PoCase } from '@/modules/purchasing/purchase-job';
import { listSuppliers, type Supplier } from '@/modules/purchasing/supplier-data';

export const dynamic = 'force-dynamic';

async function PoSheet({ current, user, suppliers, closeHref }: { current: PoCase; user: SessionUser; suppliers: Supplier[]; closeHref: string }) {
  const steps = await getCaseSteps(current.id);
  const can = new Set(availableSteps(purchaseJob, current.state, user).map((s) => s.name));
  const common = { job: 'purchase', caseId: current.id, version: current.version };
  return (
    <Sheet closeHref={closeHref} label={<><span className="lf-ref">{current.ref}</span>{current.title}</>}>
      <div className="lf-sheet-title"><h2>{current.data.supplier?.name ?? 'Supplier to choose'}</h2></div>
      <div className="lf-sheet-sub"><StateChip state={current.state} label={purchaseJob.states[current.state].label} />{current.data.forOrder && <span>for order <Link className="lf-row-link" href={`/orders?show=all&open=${current.data.forOrder}`}>{current.data.forOrder}</Link></span>}</div>
      {current.state === 'draft' && (
        <div className="lf-section">
          <div className="lf-review">
            <div className="lf-review-head"><Icon name="bolt" /><span className="lf-grow">Forge drafted this PO for the stock the order is short. Check it, then approve and send.</span></div>
            {can.has('approveAndSend') && <ApprovePo caseId={current.id} version={current.version} supplierId={current.data.supplier?.id ?? null} suppliers={suppliers.map((s) => ({ id: s.id, name: s.name, email: s.email }))} />}
          </div>
        </div>
      )}
      {current.state === 'sent' && (
        <div className="lf-section">
          <div className="lf-review" data-tone="green">
            <div className="lf-review-head"><Icon name="upnext" /><span className="lf-grow">Sent {current.data.sent?.via === 'email' ? 'by email' : 'by hand'} {current.data.sent ? timeAgo(current.data.sent.at) : ''}. Expected by {current.data.expectedAt}. The quantity shows as incoming stock.</span></div>
            <div className="lf-review-actions">
              {can.has('markReceived') && <PromptStepButton {...common} step="markReceived" field="note" required={false} label="Note (optional)" title="Mark as received" icon="stock" variant="primary" confirmLabel="Received">Mark as received</PromptStepButton>}
            </div>
          </div>
        </div>
      )}
      <section className="lf-section">
        <div className="lf-section-head"><span>Items</span></div>
        <table className="lf-lines">
          <thead><tr><th>Item</th><th className="lf-num">Quantity</th></tr></thead>
          <tbody>{current.data.lines.map((l) => <tr key={l.sku}><td>{l.name}<span className="lf-sku">{l.sku}</span></td><td className="lf-num">{l.quantity.toLocaleString('en-IN')} {l.unit}</td></tr>)}</tbody>
        </table>
      </section>
      <section className="lf-section">
        <div className="lf-section-head"><span>Activity</span></div>
        <div className="lf-feed">
          {[...steps].reverse().map((s) => (
            <div key={s.id} className="lf-feed-item"><Icon name={s.actor_kind === 'user' ? 'person' : 'bolt'} /><span>{s.summary} <span className="lf-feed-time">{s.actor_name} · {timeAgo(s.created_at)}</span></span></div>
          ))}
        </div>
      </section>
      {can.has('cancelPo') && (
        <div className="lf-section" style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <PromptStepButton {...common} step="cancelPo" field="reason" label="Why cancel it" title="Cancel purchase order" icon="x" variant="ghost" confirmLabel="Cancel PO">Cancel PO</PromptStepButton>
        </div>
      )}
    </Sheet>
  );
}

export default async function PurchasingPage({ searchParams }: { searchParams: { view?: string; open?: string } }) {
  const user = await guardModulePage('purchasing', 'purchasing:read');
  if (!user) return <AccessNotice area="Purchase orders" />;
  const view = searchParams.view === 'all' || searchParams.view === 'suppliers' ? searchParams.view : 'open';
  const base = view === 'open' ? '/purchasing' : `/purchasing?view=${view}`;
  const join = base.includes('?') ? '&' : '?';
  const canWrite = hasPermission(user, 'purchasing:write');

  let rows: PoCase[] = [];
  let suppliers: Supplier[];
  let selected: PoCase | null = null;
  let skus: { sku: string; name: string }[];
  try {
    suppliers = await listSuppliers();
    skus = (await productSource().list()).map((p) => ({ sku: p.sku, name: p.name }));
    if (view !== 'suppliers') rows = await listCases({ job: 'purchase', openOnly: view === 'open' }) as PoCase[];
    if (searchParams.open) {
      const found = await getCaseByRef(searchParams.open);
      if (found?.job === 'purchase') selected = found as PoCase;
    }
  } catch (error) {
    return <SetupNotice message={error instanceof Error ? error.message : String(error)} />;
  }

  return (
    <main className="lf-page">
      <PageBar
        icon="send"
        title="Purchase orders"
        description="Forge drafts a purchase order when a confirmed order is short of stock. You approve it; Forge emails the supplier and tracks the stock on the way."
        views={[
          { label: 'Open', href: '/purchasing', current: view === 'open' },
          { label: 'All', href: '/purchasing?view=all', current: view === 'all' },
          { label: 'Suppliers', href: '/purchasing?view=suppliers', current: view === 'suppliers', count: suppliers.length },
        ]}
        actions={view === 'suppliers' && canWrite ? <SupplierModal skus={skus} /> : undefined}
      />
      {view === 'suppliers' ? (
        suppliers.length === 0 ? <div className="lf-empty"><strong>No suppliers yet</strong>Add the suppliers you buy from, and the items each one supplies.</div> : (
          <div className="lf-table-wrap">
            <table className="lf-table">
              <thead><tr><th>Supplier</th><th>Email</th><th>Phone</th><th>Items</th><th className="lf-num">Lead time</th>{canWrite && <th aria-label="Edit" />}</tr></thead>
              <tbody>
                {suppliers.map((s) => (
                  <tr key={s.id} style={{ cursor: 'default' }}>
                    <td><span className="lf-row-link">{s.name}</span></td>
                    <td>{s.email ?? <span className="lf-dim">No email</span>}</td>
                    <td>{s.phone ?? <span className="lf-dim">—</span>}</td>
                    <td>{s.skus.length ? s.skus.join(', ') : <span className="lf-dim">None</span>}</td>
                    <td className="lf-num">{s.lead_days} days</td>
                    {canWrite && <td style={{ padding: '0 0.25rem', width: '2.5rem' }}><SupplierModal supplier={s} skus={skus} /></td>}
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="lf-count-foot">{suppliers.length} count</div>
          </div>
        )
      ) : rows.length === 0 ? (
        <div className="lf-empty"><strong>No {view === 'open' ? 'open ' : ''}purchase orders</strong>Switch on “Draft purchase orders” in Settings → Orders & payments, and add suppliers.</div>
      ) : (
        <div className="lf-table-wrap">
          <table className="lf-table">
            <thead><tr><th><span className="lf-th"><Icon name="send" />PO</span></th><th>Status</th><th>For order</th><th>Items</th><th>Expected</th><th>Last activity</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <ClickRow key={r.id} href={`${base}${join}open=${r.ref}`} selected={selected?.id === r.id}>
                  <td><span className="lf-ref">{r.ref}</span><a className="lf-row-link" href={`${base}${join}open=${r.ref}`}>{r.title}</a></td>
                  <td><StateChip state={r.state === 'draft' ? 'draft' : r.state === 'sent' ? 'sent' : r.state === 'received' ? 'accepted' : 'lost'} label={purchaseJob.states[r.state].label} /></td>
                  <td>{r.data.forOrder ?? '—'}</td>
                  <td>{r.data.lines.map((l) => `${l.quantity.toLocaleString('en-IN')} × ${l.name}`).join(', ')}</td>
                  <td>{r.data.expectedAt ?? <span className="lf-dim">—</span>}</td>
                  <td className="lf-dim">{timeAgo(r.updated_at)}</td>
                </ClickRow>
              ))}
            </tbody>
          </table>
          <div className="lf-count-foot">{rows.length} count</div>
        </div>
      )}
      {selected && <PoSheet current={selected} user={user} suppliers={suppliers} closeHref={base} />}
    </main>
  );
}
