'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import Icon from '@/components/lf/Icon';
import Modal from '@/components/lf/Modal';

const MODES = ['UPI', 'NEFT', 'RTGS', 'IMPS', 'Cheque', 'Cash', 'Other'];

export default function RecordPaymentButton({ caseId, version, balanceRupees, variant = 'primary' }: { caseId: number; version: number; balanceRupees: number; variant?: 'primary' | 'default' }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const input = Object.fromEntries(new FormData(event.currentTarget).entries());
    const response = await fetch(`/api/jobs/order/cases/${caseId}/steps`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ step: 'recordPayment', version, input }),
    });
    const body = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) { setError(body.error ?? 'The payment was not saved.'); return; }
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      <button type="button" className={variant === 'primary' ? 'lf-btn lf-btn-primary' : 'lf-btn'} onClick={() => { setError(null); setOpen(true); }}>
        <Icon name="check" />Record payment
      </button>
      <Modal open={open} onClose={() => setOpen(false)} icon="check" title="Record payment">
        <form onSubmit={submit} className="lf-form-grid" style={{ marginTop: 0 }}>
          <div className="lf-grid-2">
            <label className="lf-field"><span>Amount received (₹)</span><input id="pay-amount" name="amount" inputMode="decimal" defaultValue={balanceRupees} required autoFocus /></label>
            <label className="lf-field"><span>Paid by</span>
              <select id="pay-mode" name="mode" defaultValue="UPI">{MODES.map((m) => <option key={m} value={m}>{m}</option>)}</select>
            </label>
          </div>
          <label className="lf-field"><span>Reference</span><input id="pay-ref" name="reference" maxLength={80} placeholder="UTR or cheque number" /></label>
          <div className="lf-modal-foot" style={{ padding: '0.25rem 0' }}>
            <span className="lf-grow">{error}</span>
            <button type="button" className="lf-btn lf-btn-ghost" onClick={() => setOpen(false)}>Cancel</button>
            <button type="submit" className="lf-btn lf-btn-primary" data-busy={busy}>Save payment</button>
          </div>
        </form>
      </Modal>
    </>
  );
}
