import Link from 'next/link';
import AccessNotice from '@/components/AccessNotice';
import CustomerEdit from '@/components/crm/CustomerEdit';
import ClickRow from '@/components/lf/ClickRow';
import { StateChip } from '@/components/lf/Chips';
import { clock, displayPhone, timeAgo } from '@/components/lf/format';
import Icon from '@/components/lf/Icon';
import PageBar from '@/components/lf/PageBar';
import Sheet from '@/components/lf/Sheet';
import SetupNotice from '@/components/SetupNotice';
import { caseMessages } from '@/core/intake';
import { formatPaise } from '@/core/money';
import { guardModulePage } from '@/core/page-guard';
import { hasPermission } from '@/core/permissions';
import { customerCases, listCustomers, type CustomerCase, type CustomerRow } from '@/modules/crm/crm-customers';
import { casePath, jobByName } from '@/modules/jobs';

export const dynamic = 'force-dynamic';

const JOB_LABELS: Record<string, string> = { quote: 'Quote', order: 'Order' };

function stateLabel(c: CustomerCase) {
  return jobByName(c.job)?.states[c.state]?.label ?? c.state;
}

async function CustomerSheet({ customer, closeHref, canWrite }: { customer: CustomerRow; closeHref: string; canWrite: boolean }) {
  const cases = await customerCases(customer.id);
  const messages = (await Promise.all(cases.map(async (c) => (await caseMessages(c.id)).map((m) => ({ ...m, ref: c.ref })))))
    .flat()
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
    .slice(0, 12);
  const detail = (icon: string, label: string, value: string | null, empty: string) => (
    <><dt><Icon name={icon} size={14} />{label}</dt><dd>{value ?? <span className="lf-dim">{empty}</span>}</dd></>
  );
  return (
    <Sheet closeHref={closeHref} label={<>Customer</>}>
      <div className="lf-sheet-title"><h2>{customer.name}</h2></div>
      <div className="lf-sheet-sub">
        {customer.company && <span>{customer.company}</span>}
        <span>{customer.quotes} {customer.quotes === 1 ? 'quote' : 'quotes'} · {customer.orders} {customer.orders === 1 ? 'order' : 'orders'}{customer.orderValuePaise ? ` · ${formatPaise(customer.orderValuePaise)} ordered` : ''}</span>
      </div>
      <section className="lf-section">
        <div className="lf-section-head"><span>Details</span>{canWrite && <CustomerEdit id={customer.id} initial={{ name: customer.name, company: customer.company ?? '', phone: displayPhone(customer.phone) ?? '', email: customer.email ?? '', gstin: customer.gstin ?? '', pincode: customer.pincode ?? '' }} />}</div>
        <dl className="lf-props">
          {detail('people', 'Company', customer.company, 'No company')}
          {detail('phone', 'Phone', displayPhone(customer.phone), 'No phone')}
          {detail('mail', 'Email', customer.email, 'No email')}
          {detail('check', 'GSTIN', customer.gstin, 'Not on file')}
          {detail('stock', 'Deliver to', customer.pincode, 'No pincode')}
        </dl>
        <p className="lf-note">Forge updates these from each quote and order. New enquiries and orders from this buyer start with them.</p>
      </section>
      <section className="lf-section">
        <div className="lf-section-head"><span>Quotes and orders</span></div>
        <table className="lf-lines">
          <thead><tr><th>Record</th><th>Status</th><th className="lf-num">Total</th><th className="lf-num">Last activity</th></tr></thead>
          <tbody>
            {cases.map((c) => {
              const total = Number((c.data as { totalPaise?: number }).totalPaise ?? (c.data as { quote?: { totalPaise?: number } }).quote?.totalPaise ?? 0);
              return (
                <tr key={c.id}>
                  <td><Link className="lf-row-link" href={casePath(c.job, c.ref).replace('?open=', '?show=all&open=')}>{c.ref}</Link> <span className="lf-dim">{JOB_LABELS[c.job] ?? c.job}</span></td>
                  <td><StateChip state={c.state} label={stateLabel(c)} /></td>
                  <td className="lf-num">{total ? formatPaise(total) : '—'}</td>
                  <td className="lf-num lf-dim">{timeAgo(c.updatedAt)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
      <section className="lf-section">
        <div className="lf-section-head"><span>Latest messages</span><Link className="lf-row-link" href={`/settings/messages?q=${encodeURIComponent(customer.name)}`}>All messages</Link></div>
        {messages.length === 0 && <p className="lf-none">No messages yet.</p>}
        {messages.map((m) => (
          <div key={m.id}>
            <div className="lf-msg-meta">
              <Icon name={m.channel === 'email' ? 'mail' : m.channel === 'sheets' ? 'sheet' : m.channel === 'webhook' ? 'webhook' : 'whatsapp'} size={12} />
              <span>{m.direction === 'in' ? customer.name : 'Forge'}</span>
              <span>· {m.ref} · {clock(m.at)}</span>
            </div>
            <div className={m.direction === 'out' ? 'lf-msg lf-msg-out' : 'lf-msg'}>{m.body}</div>
          </div>
        ))}
      </section>
    </Sheet>
  );
}

export default async function CustomersPage({ searchParams }: { searchParams: { q?: string; open?: string } }) {
  const user = await guardModulePage('crm', 'crm:read');
  if (!user) return <AccessNotice area="CRM" />;
  const q = searchParams.q?.trim() || null;
  const base = q ? `/crm/customers?q=${encodeURIComponent(q)}` : '/crm/customers';
  const join = q ? '&' : '?';

  let rows: CustomerRow[];
  try {
    rows = await listCustomers(q);
  } catch (error) {
    return <SetupNotice message={error instanceof Error ? error.message : String(error)} />;
  }
  const selected = searchParams.open ? rows.find((r) => String(r.id) === searchParams.open) ?? null : null;

  return (
    <main className="lf-page">
      <PageBar icon="people" title="Customers" description="Every buyer who sent an enquiry or placed an order. Forge keeps their details up to date from each quote and order." />
      <div className="ml-filters">
        <form action="/crm/customers" className="ml-search">
          <Icon name="search" size={14} />
          <input name="q" defaultValue={q ?? ''} placeholder="Search name, company, phone or GSTIN" aria-label="Search customers" />
        </form>
      </div>
      {rows.length === 0 ? (
        <div className="lf-empty"><strong>No customers{q ? ' match this search' : ' yet'}</strong>{q ? 'Try another name or number.' : 'A customer appears here with their first enquiry.'}</div>
      ) : (
        <div className="lf-table-wrap">
          <table className="lf-table">
            <thead><tr><th><span className="lf-th"><Icon name="person" />Customer</span></th><th>Company</th><th>Phone</th><th>Email</th><th>GSTIN</th><th className="lf-num">Quotes</th><th className="lf-num">Orders</th><th className="lf-num">Ordered</th><th>Last activity</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <ClickRow key={r.id} href={`${base}${join}open=${r.id}`} selected={selected?.id === r.id}>
                  <td><a className="lf-row-link" href={`${base}${join}open=${r.id}`}>{r.name}</a></td>
                  <td>{r.company ?? <span className="lf-dim">—</span>}</td>
                  <td>{displayPhone(r.phone) ?? <span className="lf-dim">—</span>}</td>
                  <td>{r.email ?? <span className="lf-dim">—</span>}</td>
                  <td>{r.gstin ?? <span className="lf-dim">—</span>}</td>
                  <td className="lf-num">{r.quotes}</td>
                  <td className="lf-num">{r.orders}</td>
                  <td className="lf-num">{r.orderValuePaise ? formatPaise(r.orderValuePaise) : <span className="lf-dim">—</span>}</td>
                  <td className="lf-dim">{r.lastActivityAt ? timeAgo(r.lastActivityAt) : '—'}</td>
                </ClickRow>
              ))}
            </tbody>
          </table>
          <div className="lf-count-foot">{rows.length} count</div>
        </div>
      )}
      {selected && <CustomerSheet customer={selected} closeHref={base} canWrite={hasPermission(user, 'crm:write')} />}
    </main>
  );
}
