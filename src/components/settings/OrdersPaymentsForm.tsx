'use client';

import { useState } from 'react';
import Icon from '@/components/lf/Icon';
import { useAction } from '@/components/lf/useAction';
import type { OrderRules } from '@/modules/orders/order-settings';
import type { CustomerTerms, PaymentRules, TermsMode } from '@/modules/orders/payment-settings';

const MODES: { id: TermsMode; label: string; detail: string }[] = [
  { id: 'after_dispatch', label: 'Pay after dispatch', detail: 'One payment, due a set number of days after dispatch.' },
  { id: 'advance_balance', label: 'Advance and balance', detail: 'Part of the total when the buyer confirms, the balance after dispatch.' },
  { id: 'full_advance', label: 'Full payment in advance', detail: 'The whole amount when the buyer confirms, before dispatch.' },
];

type Terms = { mode: TermsMode; advancePercent: number; advanceDays: number; balanceDays: number };

function TermsFields({ value, onChange, idPrefix }: { value: Terms; onChange: (t: Terms) => void; idPrefix: string }) {
  const set = (patch: Partial<Terms>) => onChange({ ...value, ...patch });
  return (
    <div className="lf-form-grid" style={{ marginTop: 0 }}>
      {MODES.map((m) => (
        <label key={m.id} className="lf-check">
          <input type="radio" name={`${idPrefix}-mode`} checked={value.mode === m.id} onChange={() => set({ mode: m.id })} />
          <span>{m.label}<small>{m.detail}</small></span>
        </label>
      ))}
      <div className="lf-grid-2">
        {value.mode === 'advance_balance' && (
          <label className="lf-field"><span>Advance (% of total)</span><input id={`${idPrefix}-pct`} inputMode="numeric" value={value.advancePercent} onChange={(e) => set({ advancePercent: Number(e.target.value.replace(/\D/g, '')) || 0 })} /></label>
        )}
        {value.mode !== 'after_dispatch' && (
          <label className="lf-field"><span>{value.mode === 'full_advance' ? 'Payment' : 'Advance'} due (days after confirmation)</span><input id={`${idPrefix}-adv`} inputMode="numeric" value={value.advanceDays} onChange={(e) => set({ advanceDays: Number(e.target.value.replace(/\D/g, '')) || 0 })} /><small>0 means due when the buyer confirms.</small></label>
        )}
        {value.mode !== 'full_advance' && (
          <label className="lf-field"><span>{value.mode === 'advance_balance' ? 'Balance' : 'Payment'} due (days after dispatch)</span><input id={`${idPrefix}-bal`} inputMode="numeric" value={value.balanceDays} onChange={(e) => set({ balanceDays: Number(e.target.value.replace(/\D/g, '')) || 0 })} /></label>
        )}
      </div>
    </div>
  );
}

export default function OrdersPaymentsForm({ orders, payments, sellerGstin }: { orders: OrderRules; payments: PaymentRules; sellerGstin: string }) {
  const { post, busy, error } = useAction();
  const [saved, setSaved] = useState(false);
  const [o, setO] = useState(orders);
  const [terms, setTerms] = useState<Terms>({ mode: payments.mode, advancePercent: payments.advancePercent, advanceDays: payments.advanceDays, balanceDays: payments.balanceDays });
  const [customers, setCustomers] = useState<CustomerTerms[]>(payments.customerTerms);
  const [rem, setRem] = useState({ remindersOn: payments.remindersOn, remindBeforeDays: payments.remindBeforeDays, remindEveryDays: payments.remindEveryDays, maxOverdueReminders: payments.maxOverdueReminders });

  async function save() {
    setSaved(false);
    const ok = await post('save', '/api/settings/orders', { orders: o, payments: { ...terms, customerTerms: customers, ...rem } });
    if (ok) setSaved(true);
  }

  return (
    <div onChange={() => setSaved(false)}>
      <section className="lf-form-section">
        <h2>When a buyer confirms</h2>
        <div className="lf-form-grid">
          <label className="lf-check"><input type="checkbox" checked={o.sendConfirmation} onChange={(e) => setO({ ...o, sendConfirmation: e.target.checked })} />
            <span>Send an order confirmation to the buyer<small>A message with the order PDF: items, total and the payment terms.</small></span></label>
          <label className="lf-check"><input type="checkbox" checked={o.supplierPos} onChange={(e) => setO({ ...o, supplierPos: e.target.checked })} />
            <span>Draft purchase orders to suppliers when stock is short<small>Forge drafts one PO per supplier for the shortfall. A person approves each PO before Forge emails it. Add suppliers under Purchase orders.</small></span></label>
        </div>
      </section>

      <section className="lf-form-section">
        <h2>Invoices and payment requests</h2>
        <div className="lf-form-grid">
          <label className="lf-check"><input type="radio" name="invoiceMode" checked={o.invoiceMode === 'none'} onChange={() => setO({ ...o, invoiceMode: 'none' })} />
            <span>We issue invoices from Tally or another system<small>Forge sends payment reminders as plain messages, with no documents.</small></span></label>
          <label className="lf-check"><input type="radio" name="invoiceMode" checked={o.invoiceMode === 'payment_request'} onChange={() => setO({ ...o, invoiceMode: 'payment_request' })} />
            <span>Forge sends payment requests (proforma)<small>A payment request PDF when each payment falls due: the advance on confirmation, the balance at dispatch. Not a tax invoice.</small></span></label>
          <label className="lf-check"><input type="radio" name="invoiceMode" checked={o.invoiceMode === 'tax_invoice'} onChange={() => setO({ ...o, invoiceMode: 'tax_invoice' })} />
            <span>Forge issues GST tax invoices<small>A numbered tax invoice at dispatch, with CGST and SGST inside your state or IGST across states. Check the format with your accountant before you switch this on.</small></span></label>
          {o.invoiceMode === 'tax_invoice' && (
            <div className="lf-grid-2">
              <label className="lf-field"><span>Invoice number prefix</span><input id="op-prefix" value={o.invoicePrefix} onChange={(e) => setO({ ...o, invoicePrefix: e.target.value.toUpperCase() })} /><small>Numbers read {o.invoicePrefix || 'INV/'}2026-27/0001 and restart each financial year.</small></label>
              <div className="lf-field"><span>Your GSTIN</span><p className={sellerGstin ? 'lf-note' : 'lf-error'}>{sellerGstin || 'Not set. Add it in Sales rules → On the quote.'}</p></div>
            </div>
          )}
        </div>
      </section>

      <section className="lf-form-section">
        <h2>Payment terms</h2>
        <p>The default for every buyer. A new order keeps the terms it starts with.</p>
        <div style={{ marginTop: '0.875rem' }}><TermsFields value={terms} onChange={setTerms} idPrefix="default" /></div>
      </section>

      <section className="lf-form-section">
        <h2>Terms for specific customers</h2>
        <p>Match a buyer by phone, email or company name. The first match wins.</p>
        <div className="lf-settings-list" style={{ marginTop: '0.875rem' }}>
          {customers.map((c, i) => (
            <div key={c.id} className="lf-connector" style={{ alignItems: 'flex-start', flexDirection: 'column' }}>
              <div className="lf-grid-2" style={{ width: '100%' }}>
                <label className="lf-field"><span>Customer</span><input id={`ct-name-${i}`} value={c.name} onChange={(e) => setCustomers(customers.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} placeholder="Rao Agro Exports" /></label>
                <label className="lf-field"><span>Match by phone, email or company</span><input id={`ct-match-${i}`} value={c.match} onChange={(e) => setCustomers(customers.map((x, j) => (j === i ? { ...x, match: e.target.value } : x)))} placeholder="98860 77889" /></label>
              </div>
              <TermsFields value={c} onChange={(t) => setCustomers(customers.map((x, j) => (j === i ? { ...x, ...t } : x)))} idPrefix={`ct-${i}`} />
              <button type="button" className="lf-btn lf-btn-ghost" onClick={() => setCustomers(customers.filter((_, j) => j !== i))}><Icon name="x" />Remove</button>
            </div>
          ))}
          <div><button type="button" className="lf-btn" onClick={() => setCustomers([...customers, { id: `ct-${Date.now()}`, name: '', match: '', ...terms }])}><Icon name="plus" />Add customer terms</button></div>
        </div>
      </section>

      <section className="lf-form-section">
        <h2>Payment reminders</h2>
        <p>On email, or on WhatsApp inside the 24-hour window. Otherwise the reminder goes to Up next for a person.</p>
        <div className="lf-form-grid">
          <label className="lf-check"><input type="checkbox" checked={rem.remindersOn} onChange={(e) => setRem({ ...rem, remindersOn: e.target.checked })} />
            <span>Send payment reminders<small>One reminder per step for each payment: before the due date, on it, then every few days while overdue.</small></span></label>
          <div className="lf-grid-2">
            <label className="lf-field"><span>First reminder (days before due)</span><input id="op-before" inputMode="numeric" value={rem.remindBeforeDays} onChange={(e) => setRem({ ...rem, remindBeforeDays: Number(e.target.value.replace(/\D/g, '')) || 0 })} /><small>0 means no reminder before the due date.</small></label>
            <label className="lf-field"><span>When overdue, remind every (days)</span><input id="op-every" inputMode="numeric" value={rem.remindEveryDays} onChange={(e) => setRem({ ...rem, remindEveryDays: Number(e.target.value.replace(/\D/g, '')) || 1 })} /></label>
            <label className="lf-field"><span>Stop after (overdue reminders)</span><input id="op-max" inputMode="numeric" value={rem.maxOverdueReminders} onChange={(e) => setRem({ ...rem, maxOverdueReminders: Number(e.target.value.replace(/\D/g, '')) || 0 })} /></label>
          </div>
        </div>
      </section>

      <div className="lf-form-section" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <button type="button" className="lf-btn lf-btn-primary" data-busy={busy === 'save'} onClick={save}>Save</button>
        {saved && <span className="lf-saved">Saved. New orders use these settings.</span>}
        {error && <span className="lf-error">{error}</span>}
      </div>
    </div>
  );
}
