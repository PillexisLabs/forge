'use client';

import { useState } from 'react';
import Icon from '@/components/lf/Icon';
import Modal from '@/components/lf/Modal';
import { useAction } from '@/components/lf/useAction';

export type SupplierValues = { id?: number; name: string; email: string | null; phone: string | null; skus: string[]; lead_days: number };

export default function SupplierModal({ supplier, skus }: { supplier?: SupplierValues; skus: { sku: string; name: string }[] }) {
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<string[]>(supplier?.skus ?? []);
  const { post, busy, error, setError } = useAction();
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = Object.fromEntries(new FormData(event.currentTarget).entries());
    const ok = await post('save', '/api/purchasing/suppliers', { ...form, id: supplier?.id, skus: picked });
    if (ok) setOpen(false);
  }
  return (
    <>
      {supplier
        ? <button type="button" className="lf-btn lf-btn-ghost lf-btn-icon" aria-label={`Edit ${supplier.name}`} onClick={() => { setError(null); setOpen(true); }}><Icon name="edit" /></button>
        : <button type="button" className="lf-btn lf-btn-primary" onClick={() => { setError(null); setOpen(true); }}><Icon name="plus" />Add supplier</button>}
      <Modal open={open} onClose={() => setOpen(false)} icon="send" title={supplier ? `Edit ${supplier.name}` : 'Add supplier'} wide>
        <form onSubmit={submit} className="lf-form-grid" style={{ marginTop: 0 }}>
          <div className="lf-grid-2">
            <label className="lf-field"><span>Name</span><input id="sp-name" name="name" defaultValue={supplier?.name} required /></label>
            <label className="lf-field"><span>Lead time (days)</span><input id="sp-lead" name="leadDays" inputMode="numeric" defaultValue={supplier?.lead_days ?? 7} /></label>
            <label className="lf-field"><span>Email</span><input id="sp-email" name="email" type="email" defaultValue={supplier?.email ?? ''} /><small>Forge emails purchase orders here.</small></label>
            <label className="lf-field"><span>Phone</span><input id="sp-phone" name="phone" defaultValue={supplier?.phone ?? ''} /></label>
          </div>
          <div className="lf-field">
            <span>Items this supplier supplies</span>
            <div className="lf-form-grid" style={{ marginTop: 0, gap: '0.5rem' }}>
              {skus.map((s) => (
                <label key={s.sku} className="lf-check"><input type="checkbox" checked={picked.includes(s.sku)} onChange={(e) => setPicked(e.target.checked ? [...picked, s.sku] : picked.filter((x) => x !== s.sku))} /><span>{s.name}<small>{s.sku}</small></span></label>
              ))}
            </div>
          </div>
          <div className="lf-modal-foot" style={{ padding: '0.25rem 0' }}>
            <span className="lf-grow">{error}</span>
            {supplier && <button type="button" className="lf-btn lf-btn-ghost" onClick={async () => { if (await post('archive', '/api/purchasing/suppliers', { archive: supplier.id })) setOpen(false); }}>Remove</button>}
            <button type="button" className="lf-btn lf-btn-ghost" onClick={() => setOpen(false)}>Cancel</button>
            <button type="submit" className="lf-btn lf-btn-primary" data-busy={busy === 'save'}>{supplier ? 'Save' : 'Add supplier'}</button>
          </div>
        </form>
      </Modal>
    </>
  );
}
