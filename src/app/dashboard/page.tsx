import Link from 'next/link';
import AccessNotice from '@/components/AccessNotice';
import Icon from '@/components/lf/Icon';
import Hint from '@/components/lf/Hint';
import type { GlossaryTerm } from '@/components/lf/glossary';
import PageBar from '@/components/lf/PageBar';
import SetupNotice from '@/components/SetupNotice';
import { getSql } from '@/core/db';
import { SOURCE_LABELS, type IntakeSource } from '@/core/intake';
import { isModuleOn } from '@/core/modules';
import { formatPaise } from '@/core/money';
import { productSource } from '@/core/products';
import { getSessionUserFromCookies } from '@/core/session';
import '@/modules/jobs';
import { balanceOf, paymentStatus, type OrderCase } from '@/modules/orders/order-job';
import type { QuoteCase } from '@/modules/sales/quote-job';

export const dynamic = 'force-dynamic';

const RANGES = [
  { id: '7d', label: '7 days', days: 7 },
  { id: '30d', label: '30 days', days: 30 },
  { id: '90d', label: '90 days', days: 90 },
] as const;

const CHANNEL_LABELS: Record<string, string> = { ...SOURCE_LABELS, phone: 'Phone call', walk_in: 'Walk-in' };

function Stat({ label, value, sub, href, term }: { label: string; value: string; sub?: string; href?: string; term?: GlossaryTerm }) {
  // The link covers the card; the "?" sits above it so it stays clickable.
  return (
    <div className="db-stat" data-link={href ? 'true' : undefined}>
      {href && <Link href={href} className="db-stat-link" aria-label={`${label}: ${value}`} />}
      <span className="db-stat-label">{label}{term && <Hint term={term} label={label} />}</span>
      <span className="db-stat-value">{value}</span>
      {sub && <span className="db-stat-sub">{sub}</span>}
    </div>
  );
}

/** A horizontal bar list: one series, one hue, the value printed beside each bar. */
function Bars({ rows, format }: { rows: { label: string; value: number }[]; format: (n: number) => string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className="db-bars">
      {rows.map((row) => (
        <li key={row.label} title={`${row.label}: ${format(row.value)}`}>
          <span className="db-bar-label">{row.label}</span>
          <span className="db-bar-track"><span className="db-bar-fill" style={{ width: `${Math.max(2, (row.value / max) * 100)}%` }} /></span>
          <span className="db-bar-value">{format(row.value)}</span>
        </li>
      ))}
    </ul>
  );
}

/** Sales per day or week as columns on one baseline, with the total on hover. */
function Columns({ rows }: { rows: { label: string; value: number }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <div className="db-cols" role="img" aria-label={`Sales: ${rows.map((r) => `${r.label} ${formatPaise(r.value)}`).join(', ')}`}>
      {rows.map((row) => (
        <div key={row.label} className="db-col" title={`${row.label}: ${formatPaise(row.value)}`}>
          <span className="db-col-bar" style={{ height: `${row.value ? Math.max(3, (row.value / max) * 100) : 0}%` }} />
          <span className="db-col-label">{row.label}</span>
        </div>
      ))}
    </div>
  );
}

// The sales dashboard: money in, money owed, the pipeline, and where
// enquiries come from, for one date range. Every number links to its list.
export default async function DashboardPage({ searchParams }: { searchParams: { range?: string } }) {
  const user = await getSessionUserFromCookies();
  if (!user || (!(await isModuleOn('sales')) && !(await isModuleOn('orders')))) return <AccessNotice area="Dashboard" />;
  const range = RANGES.find((r) => r.id === searchParams.range) ?? RANGES[1];
  const since = new Date(Date.now() - range.days * 86400000);

  let quotes: QuoteCase[];
  let orders: OrderCase[];
  let short: { name: string; sku: string; available: number; unit: string }[];
  try {
    const sql = getSql();
    quotes = await sql<QuoteCase[]>`select * from cases where job = 'quote'`;
    orders = await sql<OrderCase[]>`select * from cases where job = 'order'`;
    short = (await productSource().list()).filter((p) => p.available < 0).map((p) => ({ name: p.name, sku: p.sku, available: p.available, unit: p.unit }));
  } catch (error) {
    return <SetupNotice message={error instanceof Error ? error.message : String(error)} />;
  }

  const inRange = (at: string) => new Date(at) >= since;
  const live = orders.filter((o) => o.state !== 'cancelled');
  const rangeOrders = live.filter((o) => inRange(o.created_at));
  const sales = rangeOrders.reduce((sum, o) => sum + o.data.totalPaise, 0);
  const collected = live.flatMap((o) => o.data.payment?.payments ?? []).filter((p) => inRange(p.at)).reduce((sum, p) => sum + p.amountPaise, 0);
  const pending = live.reduce((sum, o) => sum + balanceOf(o.data), 0);
  const overdueOrders = live.filter((o) => paymentStatus(o.data, o.state).key === 'overdue');
  const overdue = overdueOrders.reduce((sum, o) => sum + balanceOf(o.data), 0);
  const openQuotes = quotes.filter((q) => !q.closed_at && q.data.quote);
  const openQuoteValue = openQuotes.reduce((sum, q) => sum + (q.data.quote?.totalPaise ?? 0), 0);
  const rangeQuotes = quotes.filter((q) => inRange(q.created_at));
  const won = rangeQuotes.filter((q) => q.state === 'accepted').length;
  const decided = rangeQuotes.filter((q) => q.state === 'accepted' || q.state === 'lost').length;
  const conversion = decided ? Math.round((won / decided) * 100) : null;

  const bySource = new Map<string, number>();
  for (const q of rangeQuotes) bySource.set(q.data.enquiry.channel, (bySource.get(q.data.enquiry.channel) ?? 0) + 1);
  const sourceRows = [...bySource.entries()].sort((a, b) => b[1] - a[1]).map(([key, value]) => ({ label: CHANNEL_LABELS[key as IntakeSource] ?? key, value }));

  const byCustomer = new Map<string, number>();
  for (const o of rangeOrders) byCustomer.set(o.title, (byCustomer.get(o.title) ?? 0) + o.data.totalPaise);
  const customerRows = [...byCustomer.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([label, value]) => ({ label, value }));

  // Sales per day (7 days) or per week (30 and 90 days), oldest first, empty buckets included.
  const bucketDays = range.days === 7 ? 1 : 7;
  const buckets = Math.ceil(range.days / bucketDays);
  const fmt = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' });
  const columns = Array.from({ length: buckets }, (_, i) => {
    const start = new Date(since.getTime() + i * bucketDays * 86400000);
    const end = new Date(start.getTime() + bucketDays * 86400000);
    const value = rangeOrders.filter((o) => new Date(o.created_at) >= start && new Date(o.created_at) < end).reduce((sum, o) => sum + o.data.totalPaise, 0);
    return { label: fmt.format(start), value };
  });

  return (
    <main className="lf-page">
      <PageBar
        icon="chart"
        title="Dashboard"
        description={`Sales, payments and the quote pipeline for the last ${range.label}. Payment and pipeline totals are as of now.`}
        views={RANGES.map((r) => ({ label: r.label, href: `/dashboard?range=${r.id}`, current: r.id === range.id }))}
      />
      <div className="db">
        <section className="db-stats">
          <Stat term="sales" label="Sales" value={formatPaise(sales)} sub={`${rangeOrders.length} ${rangeOrders.length === 1 ? 'order' : 'orders'}`} href="/orders?show=all" />
          <Stat term="collected" label="Collected" value={formatPaise(collected)} sub="payments received" href="/orders?show=all" />
          <Stat term="pendingPayment" label="Pending payment" value={formatPaise(pending)} sub={overdue ? `${formatPaise(overdue)} overdue, ${overdueOrders.length} ${overdueOrders.length === 1 ? 'order' : 'orders'}` : 'nothing overdue'} href="/orders" />
          <Stat term="openQuotes" label="Open quotes" value={formatPaise(openQuoteValue)} sub={`${openQuotes.length} quotes · ${conversion === null ? 'no decided quotes yet' : `${conversion}% won of decided`}`} href="/sales" />
        </section>

        <div className="db-grid">
          <section className="db-card db-wide">
            <div className="db-card-head"><h2>Sales</h2><span className="db-card-sub">per {bucketDays === 1 ? 'day' : 'week'}, order value with GST and freight</span></div>
            {sales === 0 ? <p className="db-empty">No orders in this range.</p> : <Columns rows={columns} />}
          </section>

          <section className="db-card">
            <div className="db-card-head"><h2>Enquiries by source</h2><span className="db-card-sub">{rangeQuotes.length} in range</span></div>
            {sourceRows.length === 0 ? <p className="db-empty">No enquiries in this range.</p> : <Bars rows={sourceRows} format={(n) => String(n)} />}
          </section>

          <section className="db-card">
            <div className="db-card-head"><h2>Top customers</h2><span className="db-card-sub">by order value</span></div>
            {customerRows.length === 0 ? <p className="db-empty">No orders in this range.</p> : <Bars rows={customerRows} format={formatPaise} />}
          </section>

          <section className="db-card">
            <div className="db-card-head"><h2>Overdue payments</h2><span className="db-card-sub">{formatPaise(overdue)}</span></div>
            {overdueOrders.length === 0 ? <p className="db-empty"><Icon name="check" />Nothing overdue.</p> : (
              <ul className="db-list">
                {overdueOrders.sort((a, b) => balanceOf(b.data) - balanceOf(a.data)).slice(0, 6).map((o) => (
                  <li key={o.id}><Link href={`/orders?open=${o.ref}`}>{o.title}<span className="lf-ref">{o.ref}</span></Link><span>{formatPaise(balanceOf(o.data))}</span><span className="db-bad">{paymentStatus(o.data, o.state).label}</span></li>
                ))}
              </ul>
            )}
          </section>

          <section className="db-card">
            <div className="db-card-head"><h2>Short stock</h2><span className="db-card-sub">committed beyond on hand</span></div>
            {short.length === 0 ? <p className="db-empty"><Icon name="check" />Stock covers every confirmed order.</p> : (
              <ul className="db-list">
                {short.map((p) => <li key={p.sku}><Link href="/inventory">{p.name}<span className="lf-ref">{p.sku}</span></Link><span className="db-bad">{p.available.toLocaleString('en-IN')} {p.unit}</span></li>)}
              </ul>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
