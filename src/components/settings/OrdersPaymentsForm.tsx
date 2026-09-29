'use client';

import { useState } from 'react';
import Icon from '@/components/lf/Icon';
import Modal from '@/components/lf/Modal';
import { useAction } from '@/components/lf/useAction';
import type { OrderRules } from '@/modules/orders/order-settings';
import type { CustomerTerms, PaymentRules, TermsMode } from '@/modules/orders/payment-settings';
import { Affix, Card, Choices, digits, Row, SaveBar, Switch } from './kit';

type Terms = { mode: TermsMode; advancePercent: number; advanceDays: number; balanceDays: number };

const MODES: { id: TermsMode; label: string; detail: string }[] = [
  { id: 'after_dispatch', label: 'Pay after dispatch', detail: 'One payment, a set number of days after dispatch.' },
  { id: 'advance_balance', label: 'Advance and balance', detail: 'Part when the buyer confirms, the rest after dispatch.' },
  { id: 'full_advance', label: 'Full payment in advance', detail: 'The whole amount when the buyer confirms.' },
];

function termsText(t: Terms): string {
  const adv = t.advanceDays ? `within ${t.advanceDays} days of confirmation` : 'on confirmation';
  if (t.mode === 'full_advance') return `Full payment ${adv}`;
  if (t.mode === 'advance_balance') return `${t.advancePercent}% ${adv}, balance ${t.balanceDays} days after dispatch`;
  return t.balanceDays ? `Pay ${t.balanceDays} days after dispatch` : 'Pay on dispatch';
}

function TermsRows({ t, set, id }: { t: Terms; set: (patch: Partial<Terms>) => void; id: string }) {
  return (
    <>
      <div className="st-block"><Choices label="Payment terms" value={t.mode} onChange={(v) => set({ mode: v })} options={MODES} /></div>
      {t.mode === 'advance_balance' && (
        <Row label="Advance" description="Share of the order total." htmlFor={`${id}-pct`}>
          <Affix after="%"><input id={`${id}-pct`} inputMode="numeric" value={t.advancePercent} onChange={(e) => set({ advancePercent: Number(digits(e.target.value)) || 0 })} /></Affix>
        </Row>
      )}
      {t.mode !== 'after_dispatch' && (
        <Row label={t.mode === 'full_advance' ? 'Payment due' : 'Advance due'} description="Days after the buyer confirms. 0 means on confirmation." htmlFor={`${id}-adv`}>
          <Affix after="days"><input id={`${id}-adv`} inputMode="numeric" value={t.advanceDays} onChange={(e) => set({ advanceDays: Number(digits(e.target.value)) || 0 })} /></Affix>
        </Row>
      )}
      {t.mode !== 'full_advance' && (
        <Row label={t.mode === 'advance_balance' ? 'Balance due' : 'Payment due'} description="Days after dispatch." htmlFor={`${id}-bal`}>
          <Affix after="days"><input id={`${id}-bal`} inputMode="numeric" value={t.balanceDays} onChange={(e) => set({ balanceDays: Number(digits(e.target.value)) || 0 })} /></Affix>
        </Row>
      )}
    </>
  );
}

function CustomerModal({ initial, onSave, onClose }: { initial: CustomerTerms; onSave: (c: CustomerTerms) => void; onClose: () => void }) {
  const [c, setC] = useState(initial);
  const set = (patch: Partial<CustomerTerms>) => setC({ ...c, ...patch });
  return (
    <Modal open onClose={onClose} icon="person" title={initial.name ? `Terms for ${initial.name}` : 'Add customer terms'} wide footer={(
      <>
        <span className="lf-grow" />
        <button type="button" className="lf-btn lf-btn-ghost" onClick={onClose}>Cancel</button>
        <button type="button" className="lf-btn lf-btn-primary" disabled={!c.name.trim() || !c.match.trim()} onClick={() => onSave(c)}>Done</button>
      </>
    )}>
      <div className="lf-grid-2">
        <label className="lf-field"><span>Customer</span><input id="ct-name" value={c.name} onChange={(e) => set({ name: e.target.value })} placeholder="Rao Agro Exports" autoFocus /></label>
        <label className="lf-field"><span>Match by</span><input id="ct-match" value={c.match} onChange={(e) => set({ match: e.target.value })} placeholder="Phone, email or company name" /></label>
      </div>
      <div className="st-card" style={{ marginTop: '0.25rem' }}><div className="st-rows"><TermsRows t={c} set={set} id="ct" /></div></div>
    </Modal>
  );
}

type Form = { orders: OrderRules; terms: Terms; customers: CustomerTerms[]; rem: { remindersOn: boolean; remindBeforeDays: number; remindEveryDays: number; maxOverdueReminders: number } };

export default function OrdersPaymentsForm({ orders, payments, sellerGstin }: { orders: OrderRules; payments: PaymentRules; sellerGstin: string }) {
  const initial: Form = {
    orders,
    terms: { mode: payments.mode, advancePercent: payments.advancePercent, advanceDays: payments.advanceDays, balanceDays: payments.balanceDays },
    customers: payments.customerTerms,
    rem: { remindersOn: payments.remindersOn, remindBeforeDays: payments.remindBeforeDays, remindEveryDays: payments.remindEveryDays, maxOverdueReminders: payments.maxOverdueReminders },
  };
  const [base, setBase] = useState(initial);
  const [f, setF] = useState(initial);
  const [saved, setSaved] = useState(false);
  const [editing, setEditing] = useState<{ index: number; value: CustomerTerms } | null>(null);
  const { post, busy, error } = useAction();
  const update = (next: Form) => { setF(next); setSaved(false); };
  const setO = (patch: Partial<OrderRules>) => update({ ...f, orders: { ...f.orders, ...patch } });
  const setR = (patch: Partial<Form['rem']>) => update({ ...f, rem: { ...f.rem, ...patch } });
  const dirty = JSON.stringify(f) !== JSON.stringify(base);

  return (
    <div className="st-stack">
      <Card title="When a buyer confirms">
        <Row label="Send an order confirmation" description="A message with the order PDF: items, total and payment terms.">
          <Switch id="op-confirm" label="Send an order confirmation" checked={f.orders.sendConfirmation} onChange={(v) => setO({ sendConfirmation: v })} />
        </Row>
        <Row label="Draft purchase orders for short stock" description="One draft PO per supplier for the shortfall. A person approves each before Forge emails it.">
          <Switch id="op-pos" label="Draft purchase orders" checked={f.orders.supplierPos} onChange={(v) => setO({ supplierPos: v })} />
        </Row>
      </Card>

      <Card title="Invoices" description="Which document Forge sends when a payment falls due.">
        <div className="st-block">
          <Choices label="Invoices" value={f.orders.invoiceMode} onChange={(v) => setO({ invoiceMode: v })} options={[
            { id: 'none', label: 'None, we use Tally or another system', detail: 'Forge sends payment reminders as plain messages.' },
            { id: 'payment_request', label: 'Payment requests (proforma)', detail: 'A payment request PDF for the advance on confirmation and the balance at dispatch.', badge: 'Recommended' },
            { id: 'tax_invoice', label: 'GST tax invoices', detail: 'A numbered tax invoice at dispatch, with CGST and SGST or IGST. Check the format with your accountant first.' },
          ]} />
        </div>
        {f.orders.invoiceMode === 'tax_invoice' && (
          <>
            <Row label="Invoice number prefix" description={`Numbers read ${f.orders.invoicePrefix || 'INV/'}2026-27/0001 and restart each financial year.`} htmlFor="op-prefix">
              <input id="op-prefix" className="st-text" value={f.orders.invoicePrefix} onChange={(e) => setO({ invoicePrefix: e.target.value.toUpperCase() })} />
            </Row>
            <Row label="Your GSTIN" description={sellerGstin ? 'From Sales rules → Business details.' : 'Add it in Sales rules → Business details before you issue invoices.'}>
              <span className={sellerGstin ? '' : 'lf-error'}>{sellerGstin || 'Not set'}</span>
            </Row>
          </>
        )}
      </Card>

      <Card title="Payment terms" description="The default for every buyer. An order keeps the terms it started with.">
        <TermsRows t={f.terms} set={(patch) => update({ ...f, terms: { ...f.terms, ...patch } })} id="dt" />
      </Card>

      <Card title="Customer-specific terms" description="Matched by phone, email or company name. The first match wins.">
        {f.customers.length === 0 && <p className="st-empty">Every customer uses the default terms.</p>}
        {f.customers.map((c, i) => (
          <div key={c.id} className="st-list-row">
            <span className="st-list-text"><strong>{c.name}</strong><span>{termsText(c)} · matches “{c.match}”</span></span>
            <button type="button" className="lf-btn lf-btn-ghost" onClick={() => setEditing({ index: i, value: c })}>Edit</button>
            <button type="button" className="lf-btn lf-btn-ghost lf-btn-icon" aria-label={`Remove ${c.name}`} onClick={() => update({ ...f, customers: f.customers.filter((_, j) => j !== i) })}><Icon name="x" /></button>
          </div>
        ))}
        <div className="st-list-row">
          <button type="button" className="lf-btn" onClick={() => setEditing({ index: -1, value: { id: `ct-${Date.now()}`, name: '', match: '', ...f.terms } })}><Icon name="plus" />Add customer terms</button>
        </div>
      </Card>

      <Card title="Payment reminders" description="On email, or on WhatsApp inside the 24-hour window. Otherwise the reminder goes to Up next.">
        <Row label="Send payment reminders" description="One reminder per step for each payment.">
          <Switch id="op-rem" label="Send payment reminders" checked={f.rem.remindersOn} onChange={(v) => setR({ remindersOn: v })} />
        </Row>
        <Row label="First reminder" description="Days before the due date. 0 means none before." htmlFor="op-before" disabled={!f.rem.remindersOn}>
          <Affix after="days before"><input id="op-before" inputMode="numeric" value={f.rem.remindBeforeDays} onChange={(e) => setR({ remindBeforeDays: Number(digits(e.target.value)) || 0 })} /></Affix>
        </Row>
        <Row label="When overdue, remind every" htmlFor="op-every" disabled={!f.rem.remindersOn}>
          <Affix after="days"><input id="op-every" inputMode="numeric" value={f.rem.remindEveryDays} onChange={(e) => setR({ remindEveryDays: Number(digits(e.target.value)) || 1 })} /></Affix>
        </Row>
        <Row label="Stop after" htmlFor="op-max" disabled={!f.rem.remindersOn}>
          <Affix after="reminders"><input id="op-max" inputMode="numeric" value={f.rem.maxOverdueReminders} onChange={(e) => setR({ maxOverdueReminders: Number(digits(e.target.value)) || 0 })} /></Affix>
        </Row>
      </Card>

      {editing && (
        <CustomerModal
          initial={editing.value}
          onClose={() => setEditing(null)}
          onSave={(c) => {
            const customers = editing.index === -1 ? [...f.customers, c] : f.customers.map((x, j) => (j === editing.index ? c : x));
            update({ ...f, customers });
            setEditing(null);
          }}
        />
      )}

      <SaveBar
        dirty={dirty} busy={busy === 'save'} error={error} saved={saved}
        onDiscard={() => setF(base)}
        onSave={async () => {
          const ok = await post('save', '/api/settings/orders', { orders: f.orders, payments: { ...f.terms, customerTerms: f.customers, ...f.rem } });
          if (ok) { setBase(f); setSaved(true); }
        }}
      />
    </div>
  );
}
