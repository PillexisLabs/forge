'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import Icon from '@/components/lf/Icon';
import Modal from '@/components/lf/Modal';
import { formatPaise } from '@/core/money';

type ProductOption = { sku: string; name: string; unit: string; ratePaise: number; available: number };
type Line = { key: number; sku: string; quantity: string };
let nextKey = 0;

// Build or edit the quote lines in a modal. Prices, GST and freight are
// calculated by the rules when the draft is saved; nobody types an amount.
export default function QuoteEditor({
  caseId, version, products, lines: initial, pincode: initialPin, label, variant = 'default', warning,
}: {
  caseId: number; version: number; products: ProductOption[];
  lines: { sku: string; quantity: number }[]; pincode: string | null; label: string; variant?: 'default' | 'primary'; warning?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [lines, setLines] = useState<Line[]>([]);
  const [pincode, setPincode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bySku = new Map(products.map((p) => [p.sku, p]));

  function start() {
    setLines(initial.length ? initial.map((l) => ({ key: ++nextKey, sku: l.sku, quantity: String(l.quantity) })) : [{ key: ++nextKey, sku: '', quantity: '' }]);
    setPincode(initialPin ?? '');
    setError(null);
    setOpen(true);
  }

  const preview = lines.reduce((sum, l) => {
    const p = bySku.get(l.sku);
    const q = Number(l.quantity);
    return p && Number.isInteger(q) && q > 0 ? sum + p.ratePaise * q : sum;
  }, 0);

  async function save() {
    setBusy(true);
    const response = await fetch(`/api/jobs/quote/cases/${caseId}/steps`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ step: 'draftQuote', version, input: { pincode, lines: lines.filter((l) => l.sku).map((l) => ({ sku: l.sku, quantity: Number(l.quantity) })) } }),
    });
    const body = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) { setError(body.error ?? 'The quote was not saved.'); return; }
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      <button type="button" className={variant === 'primary' ? 'lf-btn lf-btn-primary' : 'lf-btn'} onClick={start}>
        <Icon name="edit" />{label}
      </button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        icon="quote"
        title="Quote items"
        wide
        footer={(
          <>
            <span className="lf-grow">{error}</span>
            <button type="button" className="lf-btn lf-btn-ghost" onClick={() => setOpen(false)}>Cancel</button>
            <button type="button" className="lf-btn lf-btn-primary" data-busy={busy} onClick={save}>Save draft</button>
          </>
        )}
      >
        {warning && <p className="lf-note">{warning}</p>}
        {lines.map((line, index) => {
          const product = bySku.get(line.sku);
          const qty = Number(line.quantity);
          return (
            <div key={line.key} className="lf-grid-line">
              <label className="lf-field">
                {index === 0 && <span>Item</span>}
                <select id={`q-sku-${line.key}`} value={line.sku} onChange={(e) => setLines((ls) => ls.map((l) => (l.key === line.key ? { ...l, sku: e.target.value } : l)))}>
                  <option value="">Choose an item</option>
                  {products.map((p) => <option key={p.sku} value={p.sku}>{p.name} · {formatPaise(p.ratePaise)}/{p.unit}</option>)}
                </select>
                {product && Number.isInteger(qty) && qty > product.available && <small className="lf-error">Only {product.available.toLocaleString('en-IN')} {product.unit} free in stock.</small>}
              </label>
              <label className="lf-field">
                {index === 0 && <span>Quantity</span>}
                <input id={`q-qty-${line.key}`} inputMode="numeric" value={line.quantity} onChange={(e) => setLines((ls) => ls.map((l) => (l.key === line.key ? { ...l, quantity: e.target.value.replace(/\D/g, '') } : l)))} />
              </label>
              <button type="button" className="lf-btn lf-btn-ghost lf-btn-icon" aria-label={`Remove item ${index + 1}`} disabled={lines.length === 1} onClick={() => setLines((ls) => ls.filter((l) => l.key !== line.key))}>
                <Icon name="x" />
              </button>
            </div>
          );
        })}
        <div><button type="button" className="lf-btn lf-btn-ghost" onClick={() => setLines((ls) => [...ls, { key: ++nextKey, sku: '', quantity: '' }])}><Icon name="plus" />Add item</button></div>
        <div className="lf-grid-2">
          <label className="lf-field">
            <span>Delivery pincode</span>
            <input id="q-pincode" inputMode="numeric" maxLength={6} value={pincode} onChange={(e) => setPincode(e.target.value.replace(/\D/g, ''))} />
          </label>
          <div className="lf-field">
            <span>Items before GST and freight</span>
            <strong style={{ lineHeight: '2rem' }}>{formatPaise(preview)}</strong>
          </div>
        </div>
      </Modal>
    </>
  );
}
