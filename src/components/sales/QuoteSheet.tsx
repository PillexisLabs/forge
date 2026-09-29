import { Fragment } from 'react';
import Icon from '@/components/lf/Icon';
import Sheet from '@/components/lf/Sheet';
import { SourceLabel, StateChip } from '@/components/lf/Chips';
import { clock, displayPhone, timeAgo } from '@/components/lf/format';
import { CopyButton, PromptStepButton, StepButton } from '@/components/jobs/StepControls';
import QuoteEditor from '@/components/sales/QuoteEditor';
import ReplyBox from '@/components/jobs/ReplyBox';
import TestModeNote from '@/components/jobs/TestModeNote';
import { channelMode } from '@/core/channels';
import { caseMessages } from '@/core/intake';
import { ASSIGNEE_LABELS, availableSteps, getCaseSteps, listCases } from '@/core/jobs';
import { formatPaise } from '@/core/money';
import { productSource } from '@/core/products';
import { replyOptionFor } from '@/core/replies';
import type { SessionUser } from '@/core/users';
import { replyRoute } from '@/modules/sales/quote-automation';
import { CHANNEL_LABELS, quoteJob, type QuoteCase } from '@/modules/sales/quote-job';
import { deliveryPhrase, quoteMessage, type QuoteLine } from '@/modules/sales/quote-rules';
import { getSalesRules } from '@/modules/sales/sales-settings';

const ACTOR_ICON = { user: 'person', rule: 'bolt', employee: 'bolt' } as const;

function StockChip({ line }: { line: QuoteLine }) {
  const a = line.availability;
  if (!a) return null;
  const tone = a.status === 'in_stock' ? 'green' : a.status === 'after_incoming' ? 'amber' : 'red';
  const label = a.status === 'in_stock' ? 'In stock' : a.status === 'after_incoming' ? deliveryPhrase(line).replace(/^ships/, 'Ships') : `Short by ${a.shortBy.toLocaleString('en-IN')}`;
  return <span className="lf-chip" data-tone={tone}>{label}</span>;
}

function waLink(phone: string | null, text: string): string | null {
  const digits = (phone ?? '').replace(/\D/g, '');
  return digits.length >= 11 ? `https://wa.me/${digits}?text=${encodeURIComponent(text)}` : null;
}

// One quote, opened over the quote list. The strip at the top says what
// Forge did and what it needs from a person; everything below is the record.
export default async function QuoteSheet({ current, user, closeHref }: { current: QuoteCase; user: SessionUser; closeHref: string }) {
  const [steps, messages, products, rules, route, children, reply] = await Promise.all([
    getCaseSteps(current.id),
    caseMessages(current.id),
    productSource().list(),
    getSalesRules(),
    replyRoute(current),
    listCases({ parentCaseId: current.id }),
    replyOptionFor(current.subject),
  ]);
  const can = new Set(availableSteps(quoteJob, current.state, user).map((s) => s.name));
  const sendMode = route ? await channelMode(route.channel) : null;
  const quote = current.data.quote ?? null;
  const state = quoteJob.states[current.state];
  const origin = current.data.enquiry.channel;
  const productOptions = products.map((p) => ({ sku: p.sku, name: p.name, unit: p.unit, ratePaise: p.ratePaise, available: p.available }));
  const bySku = new Map(products.map((p) => [p.sku, p]));
  const common = { job: 'quote', caseId: current.id, version: current.version };
  const approved = quote && current.data.approval?.version === quote.version;
  const text = quote ? quoteMessage({ buyerName: current.subject.buyerName, ref: current.ref, quote, businessName: rules.businessName }) : '';
  const overLimit = quote ? rules.approvalMode === 'always' || quote.totalPaise > rules.approvalLimitRupees * 100 : false;
  const sendNote = route
    ? `Forge sends it on ${route.channel === 'whatsapp' ? 'WhatsApp' : 'email'} with the PDF.`
    : 'Forge cannot message this buyer now, so you send it.';
  const editor = (label: string, variant: 'default' | 'primary' = 'default', warning?: string) => (can.has('draftQuote') ? (
    <QuoteEditor caseId={current.id} version={current.version} products={productOptions}
      lines={quote?.lines.map((l) => ({ sku: l.sku, quantity: l.quantity })) ?? []} pincode={quote?.pincode ?? null} label={label} variant={variant} warning={warning} />
  ) : null);

  return (
    <Sheet closeHref={closeHref} label={<><span className="lf-ref">{current.ref}</span>{current.title}</>}>
      <div className="lf-sheet-title"><h2>{current.title}</h2></div>
      <div className="lf-sheet-sub">
        <StateChip state={current.state} label={state.label} />
        <span>{current.data.awaiting?.length || current.state === 'sent' ? 'Waiting for the buyer' : state.assignee ? `Waiting for ${ASSIGNEE_LABELS[state.assignee].toLowerCase()}` : 'Closed'}</span>
        <span>·</span>
        <SourceLabel source={origin} label={CHANNEL_LABELS[origin]} />
      </div>

      <div className="lf-section">
        {!state.terminal && <TestModeNote reason={sendMode?.reason} />}
        {current.data.attention && (
          <div className="lf-review" data-tone="amber">
            <div className="lf-review-head"><Icon name="message" /><span className="lf-grow">{current.data.attention.reason}</span></div>
            {can.has('sendReply') && <ReplyBox job="quote" caseId={current.id} version={current.version} option={reply} phone={current.subject.phone ?? null} />}
            <div className="lf-review-actions">
              {can.has('markHandled') && <StepButton {...common} step="markHandled" icon="check" variant="ghost">Answered another way</StepButton>}
            </div>
          </div>
        )}

        {current.state === 'draft' && quote && (
          <div className="lf-review">
            <div className="lf-review-head">
              <Icon name="bolt" />
              <span className="lf-grow">{current.data.draftedBy === 'rule' ? `Forge drafted this quote from the ${CHANNEL_LABELS[origin]} message` : `Quote v${quote.version} is ready to check`}</span>
            </div>
            {current.data.draftedBy === 'rule' && current.data.match && quote.lines.map((line) => (
              <div key={line.sku} className="lf-review-row">
                <span className="lf-review-quote">Read “{(current.data.match?.matchedOn[line.sku] ?? []).map((w) => w.replace(/(\d)([a-z])/g, '$1 $2')).join(' ')}” and {line.quantity.toLocaleString('en-IN')}</span>
                <span className="lf-arrow">→</span>
                <span>{line.quantity.toLocaleString('en-IN')} × {line.name} · {formatPaise(line.ratePaise)} <StockChip line={line} /></span>
              </div>
            ))}
            {current.data.match?.unmatched.length ? (
              <div className="lf-review-row"><span className="lf-review-quote">{current.data.match.unmatched.join(' · ')}</span><span className="lf-arrow">→</span><span className="lf-error">Not matched. Add it by hand if the buyer needs it.</span></div>
            ) : null}
            {quote.lines.some((l) => l.availability?.status === 'short') && (
              <div className="lf-review-row"><span className="lf-error">Stock does not cover every line. The quote tells the buyer the balance date is to be confirmed. Change the quantity first if you prefer.</span></div>
            )}
            <div className="lf-review-body">
              Total {formatPaise(quote.totalPaise)}. {overLimit ? `This is above the ${formatPaise(rules.approvalLimitRupees * 100)} limit, so an approver approves it next.` : sendNote}
            </div>
            <div className="lf-review-actions">
              {editor('Edit')}
              {can.has('submitQuote') && <StepButton {...common} step="submitQuote" variant="primary" icon={overLimit ? 'check' : 'send'}>{overLimit ? 'Send for approval' : 'Approve and send'}</StepButton>}
            </div>
          </div>
        )}

        {current.state === 'enquiry' && (
          <div className="lf-review" data-tone="amber">
            <div className="lf-review-head">
              <Icon name={current.data.awaiting?.length ? 'upnext' : 'edit'} />
              <span className="lf-grow">
                {current.data.awaiting?.length
                  ? `Waiting for the buyer to send the ${current.data.awaiting.join(' and ')}.`
                  : 'Forge could not match this message to the catalogue. Build the quote.'}
              </span>
            </div>
            <div className="lf-review-actions">{editor('Build quote', 'primary')}</div>
          </div>
        )}

        {current.state === 'awaiting_approval' && quote && (
          <div className="lf-review" data-tone="amber">
            <div className="lf-review-head"><Icon name="check" /><span className="lf-grow">Needs approval: v{quote.version} for {formatPaise(quote.totalPaise)}{rules.approvalMode === 'above' ? `, above the ${formatPaise(rules.approvalLimitRupees * 100)} limit` : ''}.</span></div>
            <div className="lf-review-actions">
              {can.has('returnQuote') && <PromptStepButton {...common} step="returnQuote" field="note" label="What must change" title="Return for changes" confirmLabel="Return">Return</PromptStepButton>}
              {can.has('approveQuote')
                ? <StepButton {...common} step="approveQuote" input={{ version: quote.version }} variant="primary" icon="send">Approve and send</StepButton>
                : <span className="lf-note">Only an approver can approve it.</span>}
            </div>
          </div>
        )}

        {current.state === 'approved' && quote && (
          <div className="lf-review">
            <div className="lf-review-head"><Icon name="send" /><span className="lf-grow">{route ? `Approved. Forge is sending it on ${route.channel === 'whatsapp' ? 'WhatsApp' : 'email'}.` : 'Approved. Forge cannot message this buyer now, so send it yourself.'}</span></div>
            {!route && <div className="lf-review-body">WhatsApp allows Forge to reply only within 24 hours of the buyer’s last message. Send the PDF from your phone, then mark it as sent.</div>}
            <div className="lf-review-actions">
              {!route && waLink(current.subject.phone, text) && <a className="lf-btn" href={waLink(current.subject.phone, text)!} target="_blank" rel="noreferrer"><Icon name="whatsapp" />Open in WhatsApp</a>}
              {!route && <CopyButton text={text}>Copy message</CopyButton>}
              {can.has('markSent') && <StepButton {...common} step="markSent" input={{ channel: origin === 'email' ? 'email' : 'whatsapp' }} variant={route ? 'default' : 'primary'}>Mark as sent</StepButton>}
              {editor('Edit')}
            </div>
          </div>
        )}

        {current.state === 'sent' && (
          <div className="lf-review" data-tone="green">
            <div className="lf-review-head"><Icon name="upnext" /><span className="lf-grow">Sent {current.data.sent ? timeAgo(current.data.sent.at) : ''}. When the buyer replies “confirm”, Forge creates the order.</span></div>
            <div className="lf-review-actions">
              {can.has('markAccepted') && <PromptStepButton {...common} step="markAccepted" field="buyerPo" required={false} label="Buyer PO number (optional)" title="The buyer accepted" icon="check" confirmLabel="Create order">Buyer accepted</PromptStepButton>}
            </div>
          </div>
        )}
      </div>

      <dl className="lf-props">
        <dt><Icon name="person" />Buyer</dt><dd>{current.subject.buyerName}</dd>
        <dt><Icon name="people" />Company</dt><dd className={current.subject.company ? '' : 'lf-dim'}>{current.subject.company ?? 'No company'}</dd>
        <dt><Icon name="phone" />Phone</dt><dd className={current.subject.phone ? '' : 'lf-dim'}>{displayPhone(current.subject.phone) ?? 'No phone'}</dd>
        <dt><Icon name="mail" />Email</dt><dd className={current.subject.email ? '' : 'lf-dim'}>{current.subject.email ?? 'No email'}</dd>
        <dt><Icon name="stock" />Deliver to</dt><dd className={quote ? '' : 'lf-dim'}>{quote?.pincode ?? 'No pincode yet'}</dd>
        <dt><Icon name="check" />Approval</dt><dd className={approved ? '' : 'lf-dim'}>{approved ? (current.data.approval!.basis === 'approver' ? `Approved by ${current.data.approval!.by}` : `Within the limit, checked by ${current.data.approval!.by}`) : 'Not approved'}</dd>
        {children.map((child) => (
          <Fragment key={child.id}><dt><Icon name="order" />Order</dt><dd><a className="lf-row-link" href={`/orders?open=${child.ref}`}>{child.ref}</a></dd></Fragment>
        ))}
      </dl>

      {quote && (
        <section className="lf-section">
          <div className="lf-section-head">
            <span>Quote v{quote.version}</span>
            <a className="lf-btn lf-btn-ghost" href={`/api/jobs/quote/cases/${current.id}/pdf`} target="_blank" rel="noreferrer"><Icon name="download" />PDF</a>
          </div>
          <table className="lf-lines">
            <thead><tr><th>Item</th><th className="lf-num">Quantity</th><th className="lf-num">Rate</th><th className="lf-num">Amount</th><th>Stock</th></tr></thead>
            <tbody>
              {quote.lines.map((line) => {
                const stock = bySku.get(line.sku);
                return (
                  <tr key={line.sku}>
                    <td>{line.name}<span className="lf-sku">{line.sku}{!line.availability && stock && stock.available < line.quantity ? ` · only ${stock.available.toLocaleString('en-IN')} free` : ''}</span></td>
                    <td className="lf-num">{line.quantity.toLocaleString('en-IN')} {line.unit}</td>
                    <td className="lf-num">{formatPaise(line.ratePaise)}</td>
                    <td className="lf-num">{formatPaise(line.amountPaise)}</td>
                    <td><StockChip line={line} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <dl className="lf-totals">
            <dt>Items</dt><dd>{formatPaise(quote.subtotalPaise)}</dd>
            <dt>GST</dt><dd>{formatPaise(quote.gstPaise)}</dd>
            <dt>Freight to {quote.pincode}</dt><dd>{formatPaise(quote.freightPaise)}</dd>
            <dt className="lf-total">Total</dt><dd className="lf-total">{formatPaise(quote.totalPaise)}</dd>
          </dl>
        </section>
      )}

      <section className="lf-section">
        <div className="lf-section-head"><span>Conversation</span></div>
        {messages.length === 0 && <p className="lf-none">No messages. The enquiry was recorded by hand.</p>}
        {messages.map((m) => (
          <div key={m.id}>
            <div className="lf-msg-meta">
              <Icon name={m.channel === 'email' ? 'mail' : m.channel === 'sheets' ? 'sheet' : m.channel === 'webhook' ? 'webhook' : 'whatsapp'} size={12} />
              <span>{m.direction === 'in' ? current.subject.buyerName : 'Forge'}</span>
              <span>· {clock(m.at)}</span>
              {m.attachment && <span>· {m.attachment}</span>}
              {m.status === 'test' && <span>· test mode, not delivered</span>}
              {m.status === 'failed' && <span className="lf-msg-failed">· not sent: {m.error}</span>}
            </div>
            <div className={m.direction === 'out' ? 'lf-msg lf-msg-out' : 'lf-msg'}>{m.body}</div>
          </div>
        ))}
      </section>

      <section className="lf-section">
        <div className="lf-section-head"><span>Activity</span></div>
        <div className="lf-feed">
          {[...steps].reverse().map((step) => (
            <div key={step.id} className="lf-feed-item">
              <Icon name={ACTOR_ICON[step.actor_kind]} />
              <span>{step.summary} <span className="lf-feed-time">{step.actor_name} · {timeAgo(step.created_at)}</span></span>
            </div>
          ))}
        </div>
      </section>

      {can.has('markLost') && (
        <div className="lf-section" style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <PromptStepButton {...common} step="markLost" field="reason" label="Why was it lost" title="Mark as lost" icon="x" variant="ghost" confirmLabel="Mark as lost">Mark as lost</PromptStepButton>
        </div>
      )}
    </Sheet>
  );
}
