'use client';

import { useState } from 'react';
import { useStep } from '@/components/jobs/useStep';
import { UiAlert, UiButton, UiField } from '@/components/ui/Core';
import { formatPaise } from '@/core/money';
import type { PricedQuote } from '@/modules/sales/quote-rules';

type ProductOption = { sku: string; name: string; unit: string; ratePaise: number; available: number };
type Approval = { version: number; by: string; at: string; basis: 'approver' | 'within_limit' } | null;
type DraftLine = { key: number; sku: string; quantity: string };

const SEND_CHANNELS = [
  ['whatsapp', 'WhatsApp'],
  ['email', 'Email'],
  ['phone', 'Phone call'],
  ['walk_in', 'In person'],
] as const;

let lineKey = 0;

function whatsappLink(phone: string | null, text: string): string | null {
  if (!phone) return null;
  let digits = phone.replace(/\D/g, '');
  if (digits.length === 10) digits = `91${digits}`;
  if (digits.length < 11) return null;
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

export default function QuoteWorkspace({
  caseId,
  caseRef,
  version,
  state,
  steps,
  quote,
  approval,
  products,
  priceSource,
  limitRupees,
  phone,
  message,
}: {
  caseId: number;
  caseRef: string;
  version: number;
  state: string;
  steps: string[];
  quote: PricedQuote | null;
  approval: Approval;
  products: ProductOption[];
  priceSource: string;
  limitRupees: number;
  phone: string | null;
  message: string;
}) {
  const { run, pending, error } = useStep('quote', caseId, version);
  const can = (step: string) => steps.includes(step);
  const [editing, setEditing] = useState(state === 'enquiry' || (state === 'draft' && !quote));

  const showBuilder = can('draftQuote') && (editing || state === 'enquiry');

  return (
    <>
      {showBuilder ? (
        <QuoteBuilder
          products={products}
          quote={quote}
          priceSource={priceSource}
          pending={pending === 'draftQuote'}
          warning={state === 'approved' ? 'Saving a new draft cancels the approval. The quote must be submitted again.' : null}
          onCancel={quote ? () => setEditing(false) : undefined}
          onSave={async (lines, pincode) => {
            const ok = await run('draftQuote', { lines, pincode });
            if (ok) setEditing(false);
          }}
        />
      ) : quote ? (
        <QuoteView quote={quote} approval={approval} caseRef={caseRef} />
      ) : null}

      {error && <UiAlert>{error}</UiAlert>}

      <StepActions
        state={state}
        can={can}
        pending={pending}
        run={run}
        quote={quote}
        limitRupees={limitRupees}
        phone={phone}
        message={message}
        caseRef={caseRef}
        editing={showBuilder}
        onEdit={() => setEditing(true)}
      />
    </>
  );
}

function QuoteBuilder({
  products,
  quote,
  priceSource,
  pending,
  warning,
  onSave,
  onCancel,
}: {
  products: ProductOption[];
  quote: PricedQuote | null;
  priceSource: string;
  pending: boolean;
  warning: string | null;
  onSave: (lines: { sku: string; quantity: number }[], pincode: string) => void;
  onCancel?: () => void;
}) {
  const [lines, setLines] = useState<DraftLine[]>(
    quote?.lines.length
      ? quote.lines.map((line) => ({ key: ++lineKey, sku: line.sku, quantity: String(line.quantity) }))
      : [{ key: ++lineKey, sku: '', quantity: '' }],
  );
  const [pincode, setPincode] = useState(quote?.pincode ?? '');
  const bySku = new Map(products.map((product) => [product.sku, product]));

  const preview = lines.reduce((sum, line) => {
    const product = bySku.get(line.sku);
    const quantity = Number(line.quantity);
    return product && Number.isInteger(quantity) && quantity > 0 ? sum + product.ratePaise * quantity : sum;
  }, 0);

  function update(key: number, patch: Partial<DraftLine>) {
    setLines((current) => current.map((line) => (line.key === key ? { ...line, ...patch } : line)));
  }

  return (
    <section className="job-panel">
      <header className="job-panel-head">
        <h2>{quote ? `Edit quote (now v${quote.version})` : 'Build the quote'}</h2>
        <span className="job-dim">Rates from {priceSource}</span>
      </header>
      <div className="job-lines">
        {lines.map((line, index) => {
          const product = bySku.get(line.sku);
          const quantity = Number(line.quantity);
          const short = product && Number.isInteger(quantity) && quantity > product.available;
          return (
            <div key={line.key} className="job-line">
              <UiField label={`Item ${index + 1}`}>
                <select id={`sku-${line.key}`} value={line.sku} onChange={(event) => update(line.key, { sku: event.target.value })}>
                  <option value="">Choose an item</option>
                  {products.map((option) => (
                    <option key={option.sku} value={option.sku}>
                      {option.name} · {formatPaise(option.ratePaise)}/{option.unit}
                    </option>
                  ))}
                </select>
              </UiField>
              <UiField
                label="Quantity"
                hint={product ? `${product.available.toLocaleString('en-IN')} ${product.unit} free in stock` : undefined}
                error={short ? 'More than the free stock. The order will show a shortfall.' : undefined}
              >
                <input
                  id={`qty-${line.key}`}
                  inputMode="numeric"
                  value={line.quantity}
                  onChange={(event) => update(line.key, { quantity: event.target.value.replace(/[^0-9]/g, '') })}
                />
              </UiField>
              <button
                type="button"
                className="job-line-remove"
                aria-label={`Remove item ${index + 1}`}
                disabled={lines.length === 1}
                onClick={() => setLines((current) => current.filter((l) => l.key !== line.key))}
              >
                Remove
              </button>
            </div>
          );
        })}
      </div>
      <div className="job-builder-foot">
        <UiButton type="button" variant="ghost" size="small" onClick={() => setLines((current) => [...current, { key: ++lineKey, sku: '', quantity: '' }])}>
          Add item
        </UiButton>
        <UiField label="Delivery pincode" className="job-pincode">
          <input id="pincode" inputMode="numeric" maxLength={6} value={pincode} onChange={(event) => setPincode(event.target.value.replace(/\D/g, ''))} />
        </UiField>
      </div>
      <p className="job-preview">
        Items before GST and freight: <strong>{formatPaise(preview)}</strong>. The saved quote adds GST and freight by rule.
      </p>
      {warning && <UiAlert tone="info">{warning}</UiAlert>}
      <div className="job-actions">
        <UiButton
          type="button"
          variant="primary"
          state={pending ? 'loading' : 'default'}
          onClick={() => onSave(
            lines.filter((line) => line.sku).map((line) => ({ sku: line.sku, quantity: Number(line.quantity) })),
            pincode,
          )}
        >
          Save quote draft
        </UiButton>
        {onCancel && <UiButton type="button" variant="ghost" onClick={onCancel}>Cancel</UiButton>}
      </div>
    </section>
  );
}

function QuoteView({ quote, approval, caseRef }: { quote: PricedQuote; approval: Approval; caseRef: string }) {
  const approved = approval && approval.version === quote.version;
  return (
    <section className="job-panel">
      <header className="job-panel-head">
        <h2>Quote v{quote.version}</h2>
        <a href={`/sales/${caseRef}/print`} target="_blank" rel="noreferrer" className="crm-view-link">Open PDF view</a>
      </header>
      <div className="job-table-wrap">
        <table className="job-table">
          <thead>
            <tr><th>Item</th><th className="job-num">Quantity</th><th className="job-num">Rate</th><th className="job-num">Amount</th><th className="job-num">GST</th></tr>
          </thead>
          <tbody>
            {quote.lines.map((line) => (
              <tr key={line.sku}>
                <td>{line.name}<span className="job-sku">{line.sku}</span></td>
                <td className="job-num">{line.quantity.toLocaleString('en-IN')} {line.unit}</td>
                <td className="job-num">{formatPaise(line.ratePaise)}</td>
                <td className="job-num">{formatPaise(line.amountPaise)}</td>
                <td className="job-num">{formatPaise(line.gstPaise)} <span className="job-dim">({line.gstRateBp / 100}%)</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <dl className="job-totals">
        <div><dt>Items</dt><dd>{formatPaise(quote.subtotalPaise)}</dd></div>
        <div><dt>GST</dt><dd>{formatPaise(quote.gstPaise)}</dd></div>
        <div><dt>Freight to {quote.pincode}</dt><dd>{formatPaise(quote.freightPaise)}</dd></div>
        <div className="job-total"><dt>Total</dt><dd>{formatPaise(quote.totalPaise)}</dd></div>
      </dl>
      <p className="job-dim job-source">
        Rates from {quote.priceSource}. Valid for {quote.validDays} days.
        {approved && ` ${approval.basis === 'approver' ? `Approved by ${approval.by}` : 'Within the approval limit'}.`}
      </p>
    </section>
  );
}

function StepActions({
  state,
  can,
  pending,
  run,
  quote,
  limitRupees,
  phone,
  message,
  caseRef,
  editing,
  onEdit,
}: {
  state: string;
  can: (step: string) => boolean;
  pending: string | null;
  run: (step: string, input?: Record<string, unknown>) => Promise<boolean>;
  quote: PricedQuote | null;
  limitRupees: number;
  phone: string | null;
  message: string;
  caseRef: string;
  editing: boolean;
  onEdit: () => void;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [channel, setChannel] = useState('whatsapp');
  const [copied, setCopied] = useState(false);
  const loading = (step: string) => (pending === step ? 'loading' : 'default');

  if (editing) {
    return can('markLost') ? (
      <div className="job-actions job-actions-quiet">
        <LostForm open={open === 'lost'} onOpen={() => setOpen('lost')} onClose={() => setOpen(null)} text={text} setText={setText} pending={pending} run={run} />
      </div>
    ) : null;
  }

  const link = whatsappLink(phone, message);

  return (
    <section className="job-panel job-next">
      <header className="job-panel-head"><h2>Next step</h2></header>

      {state === 'draft' && can('submitQuote') && quote && (
        <div className="job-next-body">
          <p>
            {quote.totalPaise > limitRupees * 100
              ? `The total is above the ${formatPaise(limitRupees * 100)} limit. Submitting sends it to an approver.`
              : `The total is within the ${formatPaise(limitRupees * 100)} limit. It is ready to send after you submit it.`}
          </p>
          <div className="job-actions">
            <UiButton variant="primary" state={loading('submitQuote')} onClick={() => run('submitQuote')}>Submit quote</UiButton>
            <UiButton variant="ghost" onClick={onEdit}>Edit quote</UiButton>
          </div>
        </div>
      )}

      {state === 'awaiting_approval' && quote && (
        can('approveQuote') ? (
          <div className="job-next-body">
            <p>Approve exactly v{quote.version} for {formatPaise(quote.totalPaise)}. If anyone edits it, the approval no longer applies.</p>
            <div className="job-actions">
              <UiButton variant="primary" state={loading('approveQuote')} onClick={() => run('approveQuote', { version: quote.version })}>
                Approve v{quote.version}
              </UiButton>
              <UiButton variant="secondary" onClick={() => { setOpen(open === 'return' ? null : 'return'); setText(''); }}>Return for changes</UiButton>
            </div>
            {open === 'return' && (
              <div className="job-inline-form">
                <UiField label="What must change">
                  <textarea id="return-note" rows={2} value={text} onChange={(event) => setText(event.target.value)} />
                </UiField>
                <UiButton state={loading('returnQuote')} onClick={async () => { if (await run('returnQuote', { note: text })) setOpen(null); }}>
                  Return to sales
                </UiButton>
              </div>
            )}
          </div>
        ) : (
          <p className="job-next-body">This quote waits for an approver. You can see it, but only an approver can approve it.</p>
        )
      )}

      {state === 'approved' && can('markSent') && (
        <div className="job-next-body">
          <p>Send the PDF and this message to the buyer. Then mark the quote as sent.</p>
          <pre className="job-message-draft">{message}</pre>
          <div className="job-actions">
            {link && <a className="ui-button ui-button-secondary ui-button-medium" href={link} target="_blank" rel="noreferrer"><span>Open in WhatsApp</span></a>}
            <UiButton
              variant="ghost"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(message);
                  setCopied(true);
                } catch {
                  setCopied(false);
                }
              }}
            >
              {copied ? 'Copied' : 'Copy message'}
            </UiButton>
            <a className="crm-view-link" href={`/sales/${caseRef}/print`} target="_blank" rel="noreferrer">Open PDF view</a>
          </div>
          <div className="job-send-row">
            <UiField label="Sent by">
              <select id="send-channel" value={channel} onChange={(event) => setChannel(event.target.value)}>
                {SEND_CHANNELS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </UiField>
            <UiButton variant="primary" state={loading('markSent')} onClick={() => run('markSent', { channel })}>Mark as sent</UiButton>
            {can('draftQuote') && <UiButton variant="ghost" onClick={onEdit}>Edit quote</UiButton>}
          </div>
        </div>
      )}

      {state === 'sent' && can('markAccepted') && (
        <div className="job-next-body">
          <p>When the buyer confirms, record it. Forge makes the order from this quote, so nobody types the items again.</p>
          <div className="job-send-row">
            <UiField label="Buyer PO number" hint="Optional">
              <input id="buyer-po" value={text} onChange={(event) => setText(event.target.value)} maxLength={80} />
            </UiField>
            <UiButton variant="primary" state={loading('markAccepted')} onClick={() => run('markAccepted', { buyerPo: text })}>
              Buyer accepted
            </UiButton>
          </div>
        </div>
      )}

      {state === 'enquiry' && <p className="job-next-body">Build the quote above and save the draft.</p>}
      {(state === 'accepted' || state === 'lost') && <p className="job-next-body">This case is closed.</p>}

      {can('markLost') && (
        <div className="job-actions job-actions-quiet">
          <LostForm open={open === 'lost'} onOpen={() => { setOpen('lost'); setText(''); }} onClose={() => setOpen(null)} text={text} setText={setText} pending={pending} run={run} />
        </div>
      )}
    </section>
  );
}

function LostForm({
  open,
  onOpen,
  onClose,
  text,
  setText,
  pending,
  run,
}: {
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  text: string;
  setText: (value: string) => void;
  pending: string | null;
  run: (step: string, input?: Record<string, unknown>) => Promise<boolean>;
}) {
  if (!open) return <button type="button" className="job-link-button" onClick={onOpen}>Mark as lost</button>;
  return (
    <div className="job-inline-form">
      <UiField label="Why was it lost">
        <input id="lost-reason" value={text} onChange={(event) => setText(event.target.value)} maxLength={1000} />
      </UiField>
      <div className="job-actions">
        <UiButton variant="danger" state={pending === 'markLost' ? 'loading' : 'default'} onClick={async () => { if (await run('markLost', { reason: text })) onClose(); }}>
          Mark as lost
        </UiButton>
        <UiButton variant="ghost" onClick={onClose}>Cancel</UiButton>
      </div>
    </div>
  );
}
