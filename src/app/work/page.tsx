import Link from 'next/link';
import AccessNotice from '@/components/AccessNotice';
import { PromptStepButton, StepButton } from '@/components/jobs/StepControls';
import { Chip, type Tone } from '@/components/lf/Chips';
import Icon from '@/components/lf/Icon';
import PageBar from '@/components/lf/PageBar';
import { timeAgo } from '@/components/lf/format';
import SetupNotice from '@/components/SetupNotice';
import { getSql } from '@/core/db';
import { assigneeRolesFor, availableSteps, listCases, type CaseRecord } from '@/core/jobs';
import { formatPaise } from '@/core/money';
import { getSessionUserFromCookies } from '@/core/session';
import { casePath } from '@/modules/jobs';
import { orderJob, type OrderCase } from '@/modules/orders/order-job';
import { CHANNEL_LABELS, quoteJob, type QuoteCase } from '@/modules/sales/quote-job';
import { getSalesRules } from '@/modules/sales/sales-settings';

export const dynamic = 'force-dynamic';

type Item = {
  key: string;
  href: string;
  kind: string;
  tone: Tone;
  icon: string;
  title: string;
  ref: string;
  detail: string;
  when: string;
  action?: React.ReactNode;
};

function itemsText(q: QuoteCase): string {
  const ls = q.data.quote?.lines ?? [];
  if (!ls.length) return '';
  const first = `${ls[0].quantity.toLocaleString('en-IN')} × ${ls[0].name}`;
  return ls.length > 1 ? `${first} and ${ls.length - 1} more` : first;
}

function Row({ item }: { item: Item }) {
  return (
    <div className="un-row">
      <span className="un-kind" data-tone={item.tone}><Icon name={item.icon} /></span>
      <div className="un-body">
        <div className="un-line">
          <Link href={item.href} className="un-title">{item.title}</Link>
          <span className="lf-ref">{item.ref}</span>
          <Chip tone={item.tone}>{item.kind}</Chip>
        </div>
        <p className="un-sub">{item.detail}<span className="un-when"> · {item.when}</span></p>
      </div>
      <div className="un-actions">
        <Link href={item.href} className="lf-btn lf-btn-ghost">Open</Link>
        {item.action}
      </div>
    </div>
  );
}

function Group({ title, items, empty }: { title: string; items: Item[]; empty: string }) {
  return (
    <section className="un-group">
      <div className="un-group-head">
        <h2>{title}</h2>
        <span className="un-count">{items.length}</span>
      </div>
      {items.length === 0
        ? <p className="un-empty"><Icon name="check" />{empty}</p>
        : <div className="un-list">{items.map((item) => <Row key={item.key} item={item} />)}</div>}
    </section>
  );
}

// Up next: the work that needs a person, each item with the action that
// finishes it. Forge's own work sits at the side, so the page reads as
// "what I must do" first and "what Forge did" second.
export default async function UpNextPage() {
  const user = await getSessionUserFromCookies();
  if (!user) return <AccessNotice area="Up next" />;
  const roles = assigneeRolesFor(user);

  let open: CaseRecord[];
  let ruleSteps: { summary: string; actor_name: string; created_at: string; ref: string; job: string; title: string }[];
  let ruleCount = 0;
  const rules = await getSalesRules();
  try {
    open = await listCases({ openOnly: true, limit: 300 });
    const sql = getSql();
    ruleSteps = await sql`
      select s.summary, s.actor_name, s.created_at, c.ref, c.job, c.title
      from case_steps s join cases c on c.id = s.case_id
      where s.actor_kind in ('rule', 'employee') and s.created_at > now() - interval '7 days'
      order by s.created_at desc
      limit 8
    `;
    const [count] = await sql<{ n: string }[]>`
      select count(*) as n from case_steps where actor_kind in ('rule', 'employee') and created_at > now() - interval '7 days'
    `;
    ruleCount = Number(count?.n ?? 0);
  } catch (error) {
    return <SetupNotice message={error instanceof Error ? error.message : String(error)} />;
  }

  const quotes = open.filter((c) => c.job === 'quote') as QuoteCase[];
  const orders = open.filter((c) => c.job === 'order') as OrderCase[];
  const canRun = (c: CaseRecord, step: string, def = quoteJob) => availableSteps(def, c.state, user).some((s) => s.name === step);
  const base = (c: CaseRecord) => ({ key: `${c.id}`, href: casePath(c.job, c.ref), ref: c.ref, title: c.title, when: timeAgo(c.updated_at) });
  const step = (c: CaseRecord) => ({ job: c.job, caseId: c.id, version: c.version });

  const check: Item[] = [
    ...quotes.filter((q) => q.state === 'draft' && q.data.quote).map((q): Item => {
      const over = rules.approvalMode === 'always' || q.data.quote!.totalPaise > rules.approvalLimitRupees * 100;
      return {
        ...base(q),
        kind: q.data.draftedBy === 'rule' ? 'Forge draft' : 'Draft',
        tone: 'blue',
        icon: 'bolt',
        detail: `${itemsText(q)} · ${formatPaise(q.data.quote!.totalPaise)} · from ${CHANNEL_LABELS[q.data.enquiry.channel]}`,
        action: canRun(q, 'submitQuote')
          ? <StepButton {...step(q)} step="submitQuote" variant="primary" icon={over ? 'check' : 'send'}>{over ? 'Send for approval' : 'Approve and send'}</StepButton>
          : undefined,
      };
    }),
    ...quotes.filter((q) => q.state === 'awaiting_approval').map((q): Item => ({
      ...base(q),
      kind: 'Needs approval',
      tone: 'amber',
      icon: 'check',
      detail: `${itemsText(q)} · ${formatPaise(q.data.quote?.totalPaise ?? 0)}${rules.approvalMode === 'above' ? `, above the ${formatPaise(rules.approvalLimitRupees * 100)} limit` : ''}`,
      action: canRun(q, 'approveQuote') && q.data.quote
        ? <StepButton {...step(q)} step="approveQuote" input={{ version: q.data.quote.version }} variant="primary" icon="send">Approve and send</StepButton>
        : undefined,
    })),
  ];

  const person: Item[] = [
    ...quotes.filter((q) => q.data.attention).map((q): Item => ({
      ...base(q),
      kind: 'Reply to buyer',
      tone: 'amber',
      icon: 'message',
      detail: q.data.attention!.reason,
      action: canRun(q, 'markHandled') ? <StepButton {...step(q)} step="markHandled" icon="check">Mark as answered</StepButton> : undefined,
    })),
    ...quotes.filter((q) => q.state === 'enquiry' && !q.data.awaiting?.length && !q.data.attention).map((q): Item => ({
      ...base(q), kind: 'Build quote', tone: 'amber', icon: 'edit',
      detail: `Forge could not match the items in the ${CHANNEL_LABELS[q.data.enquiry.channel]} message.`,
    })),
    ...quotes.filter((q) => q.state === 'approved').map((q): Item => ({
      ...base(q), kind: 'Send quote', tone: 'blue', icon: 'send',
      detail: `${formatPaise(q.data.quote?.totalPaise ?? 0)} approved. Forge cannot message this buyer now, so send it yourself.`,
    })),
    ...(roles.includes('operations') ? orders.filter((o) => o.state === 'confirmed').map((o): Item => ({
      ...base(o), kind: 'Dispatch', tone: 'green', icon: 'order',
      detail: `${o.data.lines.map((l) => `${l.quantity.toLocaleString('en-IN')} × ${l.name}`).join(', ')} · from ${o.data.quoteRef}`,
      action: canRun(o, 'dispatchOrder', orderJob)
        ? <PromptStepButton {...step(o)} step="dispatchOrder" field="vehicle" required={false} label="Vehicle number (optional)" title="Mark as dispatched" icon="order" variant="primary" confirmLabel="Dispatch">Dispatch</PromptStepButton>
        : undefined,
    })) : []),
  ];

  const waiting = [
    ...quotes.filter((q) => q.state === 'enquiry' && q.data.awaiting?.length).map((q) => ({ ...base(q), text: `Asked for the ${q.data.awaiting!.join(' and ')}` })),
    ...quotes.filter((q) => q.state === 'sent' && !q.data.attention).map((q) => ({ ...base(q), text: `Quote sent, ${formatPaise(q.data.quote?.totalPaise ?? 0)}` })),
  ];

  const today = new Intl.DateTimeFormat('en-IN', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Asia/Kolkata' }).format(new Date());
  const needYou = check.length + person.length;

  return (
    <main className="lf-page">
      <PageBar
        icon="upnext"
        title="Up next"
        description={`${today}. ${needYou ? `${needYou} ${needYou === 1 ? 'item needs' : 'items need'} you.` : 'Nothing needs you now.'} Forge did ${ruleCount} ${ruleCount === 1 ? 'step' : 'steps'} on its own this week.`}
      />
      <div className="un-grid">
        <div className="un-main">
          <Group title="Check and approve" items={check} empty="No drafts or approvals wait for you." />
          <Group title="Needs a person" items={person} empty="No exceptions. Forge handled the rest." />
        </div>

        <aside className="un-side">
          <section className="un-card">
            <div className="un-card-head"><h3>Waiting on buyers</h3><span className="un-count">{waiting.length}</span></div>
            {waiting.length === 0 ? <p className="un-card-empty">Nothing is waiting on a buyer.</p> : (
              <ul className="un-mini">
                {waiting.map((w) => (
                  <li key={w.key}>
                    <Link href={w.href}><span className="un-mini-title">{w.title}</span><span className="lf-ref">{w.ref}</span></Link>
                    <span className="un-mini-sub">{w.text} · {w.when}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="un-card">
            <div className="un-card-head"><h3>Forge did this</h3><span className="un-count">{ruleCount}</span></div>
            {ruleSteps.length === 0 ? <p className="un-card-empty">No automatic steps yet. Connect an integration in Settings.</p> : (
              <ul className="un-feed">
                {ruleSteps.map((s, i) => (
                  <li key={i}>
                    <span className="un-feed-dot"><Icon name="bolt" size={12} /></span>
                    <Link href={casePath(s.job, s.ref)}>
                      <span className="un-feed-text">{s.summary}</span>
                      <span className="un-mini-sub">{s.title} · {s.ref} · {timeAgo(s.created_at)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </aside>
      </div>
    </main>
  );
}
