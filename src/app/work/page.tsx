import Link from 'next/link';
import AccessNotice from '@/components/AccessNotice';
import { PromptStepButton, StepButton } from '@/components/jobs/StepControls';
import Icon from '@/components/lf/Icon';
import PageBar from '@/components/lf/PageBar';
import { timeAgo } from '@/components/lf/format';
import RecordPaymentButton from '@/components/orders/RecordPaymentButton';
import ReviewSheet, { type ReviewItem } from '@/components/work/ReviewSheet';
import { channelMode } from '@/core/channels';
import SetupNotice from '@/components/SetupNotice';
import { getSql } from '@/core/db';
import { assigneeRolesFor, availableSteps, listCases, type CaseRecord, type JobDefinition } from '@/core/jobs';
import { formatPaise } from '@/core/money';
import { getSessionUserFromCookies } from '@/core/session';
import { casePath } from '@/modules/jobs';
import { balanceOf, orderJob, paymentStatus, type OrderCase } from '@/modules/orders/order-job';
import { purchaseJob, type PoCase } from '@/modules/purchasing/purchase-job';
import { CHANNEL_LABELS, quoteJob, type QuoteCase } from '@/modules/sales/quote-job';
import { getSalesRules } from '@/modules/sales/sales-settings';

export const dynamic = 'force-dynamic';

// Up next is a signal layer: catch, act, clear. One list of things that
// need a person, most urgent first, each with the one action that clears
// it. Work Forge has already prepared (drafts, POs) is reviewed in one
// batch panel. Waiting items and Forge's own steps sit in their own tabs.

type Row = {
  key: string;
  href: string;
  icon: string;
  tone: 'red' | 'amber' | 'blue' | 'green' | 'grey';
  title: string;
  meta: string;
  when: string;
  rank: number;
  action?: React.ReactNode;
};

function lines(q: QuoteCase): string {
  const ls = q.data.quote?.lines ?? [];
  if (!ls.length) return '';
  const first = `${ls[0].quantity.toLocaleString('en-IN')} × ${ls[0].name}`;
  return ls.length > 1 ? `${first} +${ls.length - 1}` : first;
}

function List({ rows }: { rows: Row[] }) {
  return (
    <ul className="un2-list">
      {rows.map((r) => (
        <li key={r.key} className="un2-row">
          <span className="un2-icon" data-tone={r.tone}><Icon name={r.icon} size={15} /></span>
          <Link href={r.href} className="un2-main">
            <span className="un2-title">{r.title}</span>
            <span className="un2-meta">{r.meta}</span>
          </Link>
          <span className="un2-when">{r.when}</span>
          <span className="un2-action">{r.action}</span>
        </li>
      ))}
    </ul>
  );
}

export default async function UpNextPage({ searchParams }: { searchParams: { tab?: string; review?: string } }) {
  const user = await getSessionUserFromCookies();
  if (!user) return <AccessNotice area="Up next" />;
  const tab = searchParams.tab === 'waiting' || searchParams.tab === 'done' ? searchParams.tab : 'todo';
  const roles = assigneeRolesFor(user);

  let open: CaseRecord[];
  let forgeSteps: { summary: string; created_at: string; ref: string; job: string; title: string }[];
  try {
    open = await listCases({ openOnly: true, limit: 300 });
    const sql = getSql();
    forgeSteps = await sql`
      select s.summary, s.created_at, c.ref, c.job, c.title
      from case_steps s join cases c on c.id = s.case_id
      where s.actor_kind in ('rule', 'employee') and s.created_at > now() - interval '7 days'
      order by s.created_at desc limit 60
    `;
  } catch (error) {
    return <SetupNotice message={error instanceof Error ? error.message : String(error)} />;
  }
  const rules = await getSalesRules();
  const limit = rules.approvalLimitRupees * 100;

  const quotes = open.filter((c) => c.job === 'quote') as QuoteCase[];
  const orders = open.filter((c) => c.job === 'order') as OrderCase[];
  const pos = open.filter((c) => c.job === 'purchase') as PoCase[];
  const can = (c: CaseRecord, step: string, def: JobDefinition) => availableSteps(def, c.state, user).some((s) => s.name === step);
  const at = (c: CaseRecord) => ({ key: `${c.job}-${c.id}`, href: casePath(c.job, c.ref), when: timeAgo(c.updated_at).replace(' ago', '') });
  const stepOf = (c: CaseRecord) => ({ job: c.job, caseId: c.id, version: c.version });

  // ---- prepared work, reviewed in one batch ----
  const review: ReviewItem[] = [
    ...quotes.filter((q) => q.state === 'draft' && q.data.quote && can(q, 'submitQuote', quoteJob)).map((q): ReviewItem => {
      const over = rules.approvalMode === 'always' || q.data.quote!.totalPaise > limit;
      return {
        key: `q${q.id}`, job: 'quote', caseId: q.id, version: q.version, step: 'submitQuote', input: {}, href: casePath('quote', q.ref),
        kind: q.data.draftedBy === 'rule' ? 'Quote drafted by Forge' : 'Quote draft', ref: q.ref, title: q.title,
        detail: `${lines(q)} · from ${CHANNEL_LABELS[q.data.enquiry.channel]}`,
        why: q.data.draftedBy === 'rule' && q.data.match ? `Read “${Object.values(q.data.match.matchedOn).flat().map((w) => w.replace(/(\d)([a-z])/g, '$1 $2')).join(' ')}”` : null,
        amount: formatPaise(q.data.quote!.totalPaise),
        actionLabel: over ? 'Send for approval' : 'Approve and send',
        batch: !over,
      };
    }),
    ...quotes.filter((q) => q.state === 'awaiting_approval' && q.data.quote && can(q, 'approveQuote', quoteJob)).map((q): ReviewItem => ({
      key: `a${q.id}`, job: 'quote', caseId: q.id, version: q.version, step: 'approveQuote', input: { version: q.data.quote!.version }, href: casePath('quote', q.ref),
      kind: 'Above your approval limit', ref: q.ref, title: q.title, detail: lines(q), why: null,
      amount: formatPaise(q.data.quote!.totalPaise), actionLabel: 'Approve and send', batch: false,
    })),
    ...pos.filter((p) => p.state === 'draft' && p.data.supplier && can(p, 'approveAndSend', purchaseJob)).map((p): ReviewItem => ({
      key: `p${p.id}`, job: 'purchase', caseId: p.id, version: p.version, step: 'approveAndSend', input: { supplierId: p.data.supplier!.id }, href: casePath('purchase', p.ref),
      kind: 'Purchase order drafted by Forge', ref: p.ref, title: p.data.supplier!.name,
      detail: p.data.lines.map((l) => `${l.quantity.toLocaleString('en-IN')} ${l.unit} ${l.name}`).join(', '),
      why: p.data.forOrder ? `Short on order ${p.data.forOrder}` : null, amount: null, actionLabel: 'Approve and send', batch: false,
    })),
  ];

  // ---- to do: things only a person can clear, most urgent first ----
  const todo: Row[] = [
    ...orders.filter((o) => paymentStatus(o.data, o.state).key === 'overdue').map((o): Row => {
      const p = paymentStatus(o.data, o.state);
      return {
        ...at(o), icon: 'upnext', tone: 'red', rank: 0 - p.daysOverdue / 1000,
        title: `Collect ${formatPaise(p.balancePaise)} from ${o.title}`,
        meta: `${o.ref} · ${p.label.toLowerCase()} · ${o.data.payment?.reminders.filter((r) => r.sent).length ?? 0} reminders sent`,
        action: can(o, 'recordPayment', orderJob) ? <RecordPaymentButton caseId={o.id} version={o.version} balanceRupees={balanceOf(o.data) / 100} /> : undefined,
      };
    }),
    ...[...quotes, ...orders].filter((c) => (c.data as { attention?: { reason: string } | null }).attention).map((c): Row => ({
      ...at(c), icon: 'message', tone: 'amber', rank: 1,
      title: `Reply to ${c.title}`,
      meta: `${c.ref} · ${(c.data as { attention: { reason: string } }).attention.reason}`,
      action: can(c, 'markHandled', c.job === 'quote' ? quoteJob : orderJob) ? <StepButton {...stepOf(c)} step="markHandled">Mark as answered</StepButton> : undefined,
    })),
    ...pos.filter((p) => p.state === 'draft' && !p.data.supplier).map((p): Row => ({
      ...at(p), icon: 'send', tone: 'amber', rank: 2, title: 'Choose a supplier for a purchase order',
      meta: `${p.ref} · ${p.data.lines.map((l) => `${l.quantity.toLocaleString('en-IN')} ${l.name}`).join(', ')}`,
    })),
    ...quotes.filter((q) => q.state === 'enquiry' && !q.data.awaiting?.length && !q.data.attention).map((q): Row => ({
      ...at(q), icon: 'edit', tone: 'amber', rank: 3, title: `Build the quote for ${q.title}`,
      meta: `${q.ref} · Forge could not match the items in the ${CHANNEL_LABELS[q.data.enquiry.channel]} message`,
    })),
    ...quotes.filter((q) => q.state === 'approved').map((q): Row => ({
      ...at(q), icon: 'send', tone: 'blue', rank: 4, title: `Send the quote to ${q.title}`,
      meta: `${q.ref} · ${formatPaise(q.data.quote?.totalPaise ?? 0)} approved · Forge cannot message this buyer now`,
    })),
    ...(roles.includes('operations') ? orders.filter((o) => o.state === 'confirmed').map((o): Row => ({
      ...at(o), icon: 'order', tone: 'green', rank: 5, title: `Dispatch ${o.title}’s order`,
      meta: `${o.ref} · ${o.data.lines.map((l) => `${l.quantity.toLocaleString('en-IN')} × ${l.name}`).join(', ')}`,
      action: can(o, 'dispatchOrder', orderJob)
        ? <PromptStepButton {...stepOf(o)} step="dispatchOrder" field="vehicle" required={false} label="Vehicle number (optional)" title="Mark as dispatched" icon="order" variant="primary" confirmLabel="Dispatch">Dispatch</PromptStepButton>
        : undefined,
    })) : []),
  ].sort((a, b) => a.rank - b.rank);

  const waiting: Row[] = [
    ...quotes.filter((q) => q.state === 'enquiry' && q.data.awaiting?.length).map((q): Row => ({ ...at(q), icon: 'message', tone: 'grey', rank: 0, title: q.title, meta: `${q.ref} · Forge asked for the ${q.data.awaiting!.join(' and ')}` })),
    ...quotes.filter((q) => q.state === 'sent' && !q.data.attention).map((q): Row => ({ ...at(q), icon: 'quote', tone: 'grey', rank: 1, title: q.title, meta: `${q.ref} · quote of ${formatPaise(q.data.quote?.totalPaise ?? 0)} sent, waiting for “confirm”` })),
    ...orders.filter((o) => o.state === 'dispatched' && ['due', 'none', 'advance'].includes(paymentStatus(o.data, o.state).key)).map((o): Row => ({ ...at(o), icon: 'upnext', tone: 'grey', rank: 2, title: o.title, meta: `${o.ref} · ${formatPaise(balanceOf(o.data))}, ${paymentStatus(o.data, o.state).label.toLowerCase()}` })),
    ...pos.filter((p) => p.state === 'sent').map((p): Row => ({ ...at(p), icon: 'send', tone: 'grey', rank: 3, title: p.title, meta: `${p.ref} · stock expected by ${p.data.expectedAt}` })),
  ];

  const today = new Intl.DateTimeFormat('en-IN', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Asia/Kolkata' }).format(new Date());
  const dayOf = (iso: string) => new Intl.DateTimeFormat('en-IN', { weekday: 'long', day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' }).format(new Date(iso));
  const doneByDay = forgeSteps.reduce<Record<string, typeof forgeSteps>>((acc, s) => { (acc[dayOf(s.created_at)] ||= []).push(s); return acc; }, {});
  const quoteCount = review.filter((r) => r.job === 'quote').length;
  const poCount = review.filter((r) => r.job === 'purchase').length;

  return (
    <main className="lf-page">
      <PageBar
        icon="upnext"
        title="Up next"
        description={today}
        views={[
          { label: 'To do', href: '/work', current: tab === 'todo', count: todo.length + review.length },
          { label: 'Waiting on buyers', href: '/work?tab=waiting', current: tab === 'waiting', count: waiting.length },
          { label: 'Done by Forge', href: '/work?tab=done', current: tab === 'done', count: forgeSteps.length },
        ]}
      />
      <div className="un2">
        {tab === 'todo' && (
          <>
            {review.length > 0 && (
              <Link href="/work?review=1" scroll={false} className="un2-review">
                <span className="un2-review-icon"><Icon name="bolt" /></span>
                <span className="un2-review-text">
                  <strong>Forge prepared {review.length} {review.length === 1 ? 'item' : 'items'} for you to approve</strong>
                  <span>{[quoteCount && `${quoteCount} ${quoteCount === 1 ? 'quote' : 'quotes'}`, poCount && `${poCount} ${poCount === 1 ? 'purchase order' : 'purchase orders'}`].filter(Boolean).join(' and ')}. Check each one, then approve.</span>
                </span>
                <span className="lf-btn lf-btn-primary">Review</span>
              </Link>
            )}
            {todo.length === 0
              ? <div className="un2-empty"><Icon name="check" size={20} /><strong>{review.length ? 'Nothing else needs you' : 'You are all caught up'}</strong><span>Forge handles intake, drafts, sending and reminders. Items appear here only when a person must act.</span></div>
              : <List rows={todo} />}
          </>
        )}
        {tab === 'waiting' && (waiting.length === 0
          ? <div className="un2-empty"><Icon name="check" size={20} /><strong>Nothing is waiting on a buyer</strong></div>
          : <List rows={waiting} />)}
        {tab === 'done' && (forgeSteps.length === 0
          ? <div className="un2-empty"><Icon name="bolt" size={20} /><strong>No automatic steps this week</strong><span>Connect an integration in Settings → Integrations.</span></div>
          : Object.entries(doneByDay).map(([day, steps]) => (
            <section key={day} className="un2-day">
              <h2>{day}</h2>
              <ul className="un2-list">
                {steps.map((s, i) => (
                  <li key={i} className="un2-row">
                    <span className="un2-icon" data-tone="grey"><Icon name="bolt" size={15} /></span>
                    <Link href={casePath(s.job, s.ref)} className="un2-main"><span className="un2-title un2-title-plain">{s.summary}</span><span className="un2-meta">{s.title} · {s.ref}</span></Link>
                    <span className="un2-when">{new Intl.DateTimeFormat('en-IN', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' }).format(new Date(s.created_at))}</span>
                    <span className="un2-action" />
                  </li>
                ))}
              </ul>
            </section>
          )))}
      </div>
      {searchParams.review === '1' && review.length > 0 && <ReviewSheet items={review} closeHref="/work" testReason={(await channelMode('whatsapp')).reason} />}
    </main>
  );
}
