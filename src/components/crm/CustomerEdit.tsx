'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import Icon from '@/components/lf/Icon';
import Modal from '@/components/lf/Modal';

type Fields = { name: string; company: string; phone: string; email: string; gstin: string; pincode: string };

// Edit the details on file. New enquiries and orders from this buyer use them.
export default function CustomerEdit({ id, initial }: { id: number; initial: Fields }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const field = (key: keyof Fields, label: string, extra: { placeholder?: string; hint?: string; type?: string } = {}) => (
    <label className="lf-field"><span>{label}</span><input id={`cu-${key}`} type={extra.type ?? 'text'} value={f[key]} placeholder={extra.placeholder} onChange={(e) => setF({ ...f, [key]: e.target.value })} />{extra.hint && <small>{extra.hint}</small>}</label>
  );

  async function save() {
    setBusy(true);
    setError('');
    const res = await fetch(`/api/crm/customers/${id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(f) });
    setBusy(false);
    if (!res.ok) { setError((await res.json().catch(() => null))?.error ?? 'That did not work. Try again.'); return; }
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      <button type="button" className="lf-btn" onClick={() => { setF(initial); setError(''); setOpen(true); }}><Icon name="edit" />Edit details</button>
      {open && (
        <Modal open onClose={() => setOpen(false)} icon="person" title="Edit customer" footer={(
          <>
            <span className="lf-grow lf-error">{error}</span>
            <button type="button" className="lf-btn lf-btn-ghost" onClick={() => setOpen(false)}>Cancel</button>
            <button type="button" className="lf-btn lf-btn-primary" data-busy={busy} disabled={!f.name.trim() || busy} onClick={() => void save()}>Save</button>
          </>
        )}>
          <div className="lf-grid-2">{field('name', 'Name')}{field('company', 'Company')}</div>
          <div className="lf-grid-2">{field('phone', 'Phone', { placeholder: '+91 98450 12345' })}{field('email', 'Email', { type: 'email' })}</div>
          <div className="lf-grid-2">{field('gstin', 'GSTIN', { hint: 'Goes on new orders and tax invoices.' })}{field('pincode', 'Delivery pincode')}</div>
          <p className="lf-note">Forge fills these in on new enquiries and orders from this buyer. Quotes and orders already made keep their own details.</p>
        </Modal>
      )}
    </>
  );
}
