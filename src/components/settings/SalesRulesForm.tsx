'use client';

import { useState } from 'react';
import { useAction } from '@/components/lf/useAction';
import type { PaymentRules } from '@/modules/orders/payment-settings';
import type { SalesRules } from '@/modules/sales/sales-settings';

export default function SalesRulesForm({ rules, payments }: { rules: SalesRules; payments: PaymentRules }) {
  const { post, busy, error } = useAction();
  const [saved, setSaved] = useState(false);
  const [mode, setMode] = useState(rules.approvalMode);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaved(false);
    const form = new FormData(event.currentTarget);
    const body = Object.fromEntries(form.entries());
    const ok = await post('save', '/api/settings/sales-rules', {
      ...body,
      autoDraft: form.get('autoDraft') === 'on',
      autoSend: form.get('autoSend') === 'on',
      payments: {
        termsDays: body.termsDays, remindBeforeDays: body.remindBeforeDays, remindEveryDays: body.remindEveryDays,
        maxOverdueReminders: body.maxOverdueReminders, remindersOn: form.get('remindersOn') === 'on',
      },
    });
    if (ok) setSaved(true);
  }

  return (
    <form onSubmit={submit} onChange={() => setSaved(false)}>
      <section className="lf-form-section">
        <h2>Approval</h2>
        <p>Which quotes an approver must see before Forge sends them.</p>
        <div className="lf-form-grid">
          <label className="lf-check"><input type="radio" name="approvalMode" value="above" checked={mode === 'above'} onChange={() => setMode('above')} />
            <span>Only quotes above a limit<small>A person still checks every quote Forge drafts. Quotes above the limit also need an approver.</small></span></label>
          <label className="lf-check"><input type="radio" name="approvalMode" value="always" checked={mode === 'always'} onChange={() => setMode('always')} />
            <span>Every quote</span></label>
          <label className="lf-field" style={{ maxWidth: '16rem' }}><span>Approval limit (₹, total with GST and freight)</span>
            <input id="sr-limit" name="approvalLimitRupees" inputMode="numeric" defaultValue={rules.approvalLimitRupees} disabled={mode === 'always'} /></label>
        </div>
      </section>

      <section className="lf-form-section">
        <h2>Automation</h2>
        <p>What Forge does without a click.</p>
        <div className="lf-form-grid">
          <label className="lf-check"><input type="checkbox" name="autoDraft" defaultChecked={rules.autoDraft} />
            <span>Draft quotes from messages<small>Forge matches the items and quantities to the catalogue, or asks the buyer for what is missing.</small></span></label>
          <label className="lf-check"><input type="checkbox" name="autoSend" defaultChecked={rules.autoSend} />
            <span>Send approved quotes<small>Forge sends the quote and the PDF on WhatsApp or email when the buyer can receive it.</small></span></label>
        </div>
      </section>

      <section className="lf-form-section">
        <h2>Freight and validity</h2>
        <div className="lf-form-grid">
          <div className="lf-grid-2">
            <label className="lf-field"><span>Local freight (₹)</span><input id="sr-local" name="freightLocalRupees" inputMode="numeric" defaultValue={rules.freightLocalRupees} /></label>
            <label className="lf-field"><span>Outstation freight (₹)</span><input id="sr-out" name="freightOutstationRupees" inputMode="numeric" defaultValue={rules.freightOutstationRupees} /></label>
            <label className="lf-field"><span>Local pincodes start with</span><input id="sr-pins" name="localPinPrefixes" defaultValue={rules.localPinPrefixes.join(', ')} /><small>For example 56, 57 for Karnataka.</small></label>
            <label className="lf-field"><span>Quote valid for (days)</span><input id="sr-valid" name="quoteValidDays" inputMode="numeric" defaultValue={rules.quoteValidDays} /></label>
          </div>
        </div>
      </section>

      <section className="lf-form-section">
        <h2>Payments</h2>
        <p>The due date starts when the order is dispatched. Forge sends reminders on email, or on WhatsApp inside the 24-hour window. Otherwise the reminder goes to Up next for a person.</p>
        <div className="lf-form-grid">
          <div className="lf-grid-2">
            <label className="lf-field"><span>Payment due (days after dispatch)</span><input id="pr-terms" name="termsDays" inputMode="numeric" defaultValue={payments.termsDays} /></label>
            <label className="lf-field"><span>First reminder (days before due)</span><input id="pr-before" name="remindBeforeDays" inputMode="numeric" defaultValue={payments.remindBeforeDays} /><small>0 means no reminder before the due date.</small></label>
            <label className="lf-field"><span>When overdue, remind every (days)</span><input id="pr-every" name="remindEveryDays" inputMode="numeric" defaultValue={payments.remindEveryDays} /></label>
            <label className="lf-field"><span>Stop after (overdue reminders)</span><input id="pr-max" name="maxOverdueReminders" inputMode="numeric" defaultValue={payments.maxOverdueReminders} /></label>
          </div>
          <label className="lf-check"><input type="checkbox" name="remindersOn" defaultChecked={payments.remindersOn} />
            <span>Send payment reminders<small>A reminder goes out once per step: before the due date, on it, then every few days while overdue.</small></span></label>
        </div>
      </section>

      <section className="lf-form-section">
        <h2>On the quote</h2>
        <div className="lf-form-grid">
          <label className="lf-field"><span>Business name</span><input id="sr-name" name="businessName" defaultValue={rules.businessName} required /></label>
          <label className="lf-field"><span>Address</span><input id="sr-address" name="businessAddress" defaultValue={rules.businessAddress} /></label>
          <label className="lf-field" style={{ maxWidth: '16rem' }}><span>GSTIN</span><input id="sr-gstin" name="businessGstin" defaultValue={rules.businessGstin} /></label>
        </div>
      </section>

      <div className="lf-form-section" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <button type="submit" className="lf-btn lf-btn-primary" data-busy={busy === 'save'}>Save rules</button>
        {saved && <span className="lf-saved">Saved. New quotes use these rules.</span>}
        {error && <span className="lf-error">{error}</span>}
      </div>
    </form>
  );
}
