import Link from 'next/link';
import { notFound } from 'next/navigation';
import AccessNotice from '@/components/AccessNotice';
import ForgeShell from '@/components/ForgeShell';
import CaseTimeline from '@/components/jobs/CaseTimeline';
import StateBadge from '@/components/jobs/StateBadge';
import QuoteWorkspace from '@/components/sales/QuoteWorkspace';
import SetupNotice from '@/components/SetupNotice';
import { env } from '@/core/env';
import { ASSIGNEE_LABELS, availableSteps, getCaseByRef, getCaseSteps, listCases } from '@/core/jobs';
import { guardModulePage } from '@/core/page-guard';
import { productSource } from '@/core/products';
import { casePath } from '@/modules/jobs';
import { CHANNEL_LABELS, quoteJob, type QuoteCase } from '@/modules/sales/quote-job';
import { quoteMessage } from '@/modules/sales/quote-rules';

export const dynamic = 'force-dynamic';

export default async function QuoteCasePage({ params }: { params: { ref: string } }) {
  const user = await guardModulePage('sales', 'sales:read');
  if (!user) return <AccessNotice area="Sales" />;

  try {
    const found = await getCaseByRef(params.ref);
    if (!found || found.job !== 'quote') notFound();
    const current = found as QuoteCase;
    const [steps, products, children] = await Promise.all([
      getCaseSteps(current.id),
      productSource().list(),
      listCases({ parentCaseId: current.id }),
    ]);
    const stepNames = availableSteps(quoteJob, current.state, user).map((step) => step.name);
    const state = quoteJob.states[current.state];
    const quote = current.data.quote ?? null;
    const message = quote
      ? quoteMessage({ buyerName: current.subject.buyerName, ref: current.ref, quote, businessName: env.businessName() })
      : '';

    return (
      <ForgeShell
        activeArea="sales"
        title={`${current.ref} · ${current.title}`}
        description={state.assignee ? `Waiting for ${ASSIGNEE_LABELS[state.assignee].toLowerCase()}.` : 'Closed.'}
        status={<div className="job-heading-meta"><StateBadge def={quoteJob} state={current.state} /></div>}
        actions={<Link href="/sales" className="crm-view-link">All quotes</Link>}
      >
        <div className="job-case">
          <div className="job-case-main">
            <section className="job-panel">
              <header className="job-panel-head"><h2>Enquiry</h2>
                <span className="job-dim">{CHANNEL_LABELS[current.data.enquiry.channel]}</span>
              </header>
              <dl className="job-facts">
                <div><dt>Buyer</dt><dd>{current.subject.buyerName}</dd></div>
                {current.subject.company && <div><dt>Company</dt><dd>{current.subject.company}</dd></div>}
                {current.subject.phone && <div><dt>Phone</dt><dd>{current.subject.phone}</dd></div>}
              </dl>
              <blockquote className="job-message">{current.data.enquiry.message}</blockquote>
            </section>

            <QuoteWorkspace
              caseId={current.id}
              caseRef={current.ref}
              version={current.version}
              state={current.state}
              steps={stepNames}
              quote={quote}
              approval={current.data.approval ?? null}
              products={products.map((p) => ({ sku: p.sku, name: p.name, unit: p.unit, ratePaise: p.ratePaise, available: p.available }))}
              priceSource={productSource().label}
              limitRupees={env.salesApprovalLimitRupees()}
              phone={current.subject.phone}
              message={message}
            />

            {children.map((child) => (
              <p key={child.id} className="job-linked">
                This quote became order <Link href={casePath(child.job, child.ref)} className="job-ref">{child.ref}</Link>.
              </p>
            ))}
          </div>
          <aside className="job-panel job-case-side">
            <header className="job-panel-head"><h2>Timeline</h2></header>
            <CaseTimeline steps={steps} def={quoteJob} />
          </aside>
        </div>
      </ForgeShell>
    );
  } catch (error) {
    if (error && typeof error === 'object' && 'digest' in error) throw error; // notFound()
    return <SetupNotice message={error instanceof Error ? error.message : String(error)} />;
  }
}
