import Link from 'next/link';
import AccessNotice from '@/components/AccessNotice';
import Icon from '@/components/lf/Icon';
import { timeAgo } from '@/components/lf/format';
import SetupNotice from '@/components/SetupNotice';
import { getSql } from '@/core/db';
import { assigneeRolesFor, listCases, type CaseRecord } from '@/core/jobs';
import { formatPaise } from '@/core/money';
import { getSessionUserFromCookies } from '@/core/session';
import { casePath } from '@/modules/jobs';
import type { OrderCase } from '@/modules/orders/order-job';
import type { QuoteCase } from '@/modules/sales/quote-job';

export const dynamic = 'force-dynamic';

type Task = { key: string; href: string; text: string; who: string; when: string };

function lines(q: QuoteCase): string {
  const ls = q.data.quote?.lines ?? [];
  if (!ls.length) return '';
  const first = `${ls[0].quantity.toLocaleString('en-IN')} × ${ls[0].name}`;
  return ls.length > 1 ? `${first} and ${ls.length - 1} more` : first;
}

function TaskList({ tasks, empty }: { tasks: Task[]; empty: string }) {
  if (!tasks.length) return <p className="lf-none">{empty}</p>;
  return (
    <div className="lf-tasks">
      {tasks.map((task) => (
        <Link key={task.key} href={task.href} className="lf-task">
          <span className="lf-task-box" aria-hidden="true" />
          <span className="lf-grow">{task.text}</span>
          <span className="lf-dim">{task.when}</span>
          <span className="lf-task-who">{task.who}</span>
        </Link>
      ))}
    </div>
  );
}

// Up next: what needs a person now. Forge does the routine steps; this page
// lists only the checks, approvals and exceptions, and shows what Forge did.
export default async function UpNextPage() {
  const user = await getSessionUserFromCookies();
  if (!user) return <AccessNotice area="Up next" />;
  const roles = assigneeRolesFor(user);
  const approver = roles.includes('approver');

  let open: CaseRecord[];
  let ruleSteps: { summary: string; actor_name: string; created_at: string; ref: string; job: string; title: string }[];
  try {
    open = await listCases({ openOnly: true, limit: 300 });
    const sql = getSql();
    ruleSteps = await sql`
      select s.summary, s.actor_name, s.created_at, c.ref, c.job, c.title
      from case_steps s join cases c on c.id = s.case_id
      where s.actor_kind in ('rule', 'employee') and s.created_at > now() - interval '7 days'
      order by s.created_at desc
      limit 12
    `;
  } catch (error) {
    return <SetupNotice message={error instanceof Error ? error.message : String(error)} />;
  }

  const quotes = open.filter((c) => c.job === 'quote') as QuoteCase[];
  const orders = open.filter((c) => c.job === 'order') as OrderCase[];
  const task = (c: CaseRecord, text: string): Task => ({ key: `${c.id}-${text}`, href: casePath(c.job, c.ref), text, who: c.title, when: timeAgo(c.updated_at) });

  const check: Task[] = [
    ...quotes.filter((q) => q.state === 'draft' && q.data.quote).map((q) => task(q,
      q.data.draftedBy === 'rule'
        ? `Check Forge’s draft ${q.ref}: ${lines(q)}, ${formatPaise(q.data.quote!.totalPaise)}`
        : `Approve and send ${q.ref}: ${formatPaise(q.data.quote!.totalPaise)}`)),
    ...(approver ? quotes.filter((q) => q.state === 'awaiting_approval').map((q) => task(q, `Approve ${q.ref} for ${formatPaise(q.data.quote?.totalPaise ?? 0)}, above the limit`)) : []),
  ];
  const person: Task[] = [
    ...quotes.filter((q) => q.data.attention).map((q) => task(q, `${q.ref}: ${q.data.attention!.reason}`)),
    ...quotes.filter((q) => q.state === 'enquiry' && !q.data.awaiting?.length && !q.data.attention).map((q) => task(q, `Build the quote for ${q.ref}. Forge could not match the items.`)),
    ...quotes.filter((q) => q.state === 'approved').map((q) => task(q, `Send ${q.ref}. Forge cannot message this buyer now.`)),
    ...orders.filter((o) => o.state === 'confirmed').map((o) => task(o, `Dispatch ${o.ref}: ${o.data.lines.map((l) => `${l.quantity.toLocaleString('en-IN')} × ${l.name}`).join(', ')}`)),
  ];
  const waiting: Task[] = [
    ...quotes.filter((q) => q.state === 'enquiry' && q.data.awaiting?.length).map((q) => task(q, `${q.ref}: Forge asked for the ${q.data.awaiting!.join(' and ')}`)),
    ...quotes.filter((q) => q.state === 'sent' && !q.data.attention).map((q) => task(q, `${q.ref}: sent ${formatPaise(q.data.quote?.totalPaise ?? 0)}, waiting for “confirm”`)),
  ];

  const today = new Intl.DateTimeFormat('en-IN', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'Asia/Kolkata' }).format(new Date());
  const needYou = check.length + person.length;

  return (
    <main className="lf-page">
      <div className="lf-upnext">
        <h1>{today}</h1>
        <p className="lf-upnext-sub">
          {needYou ? `${needYou} ${needYou === 1 ? 'item needs' : 'items need'} you.` : 'Nothing needs you now.'}
          {ruleSteps.length ? ` Forge did ${ruleSteps.length} steps on its own this week.` : ''}
        </p>

        <section className="lf-block">
          <div className="lf-block-head"><h2>Check and approve</h2></div>
          <TaskList tasks={check} empty="No drafts to check." />
        </section>

        <section className="lf-block">
          <div className="lf-block-head"><h2>Needs a person</h2></div>
          <TaskList tasks={person} empty="No exceptions." />
        </section>

        <section className="lf-block">
          <div className="lf-block-head"><h2>Waiting on buyers</h2></div>
          <TaskList tasks={waiting} empty="Nothing is waiting on a buyer." />
        </section>

        <section className="lf-block">
          <div className="lf-block-head"><h2>Forge did this</h2></div>
          {ruleSteps.length === 0 ? <p className="lf-none">No automatic steps yet. Connect an integration in Settings.</p> : (
            <div className="lf-feed">
              {ruleSteps.map((step, i) => (
                <Link key={i} href={casePath(step.job, step.ref)} className="lf-feed-item" style={{ textDecoration: 'none' }}>
                  <Icon name="bolt" />
                  <span>{step.summary} <span className="lf-feed-time">{step.ref} · {step.title} · {timeAgo(step.created_at)}</span></span>
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
