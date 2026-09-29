'use client';

import { useState } from 'react';
import Icon from '@/components/lf/Icon';
import Modal from '@/components/lf/Modal';
import { useAction } from '@/components/lf/useAction';

export type ItemValues = {
  sku: string; name: string; unit: string; rateRupees: number; gstPercent: number; hsn: string | null;
  onHand: number; incomingLocal: number; incomingImport: number;
};

const EMPTY: ItemValues = { sku: '', name: '', unit: 'pcs', rateRupees: 0, gstPercent: 18, hsn: '', onHand: 0, incomingLocal: 0, incomingImport: 0 };

export function ItemModal({ item, trigger }: { item?: ItemValues; trigger: 'add' | 'edit' }) {
  const [open, setOpen] = useState(false);
  const { post, busy, error, setError } = useAction();

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget).entries());
    const ok = await post('save', '/api/inventory/items', { item: { ...values, sku: item?.sku ?? values.sku } });
    if (ok) setOpen(false);
  }

  const v = item ?? EMPTY;
  return (
    <>
      {trigger === 'add'
        ? <button type="button" className="lf-btn lf-btn-primary" onClick={() => { setError(null); setOpen(true); }}><Icon name="plus" />Add item</button>
        : <button type="button" className="lf-btn lf-btn-ghost lf-btn-icon" aria-label={`Edit ${v.name}`} onClick={() => { setError(null); setOpen(true); }}><Icon name="edit" /></button>}
      <Modal open={open} onClose={() => setOpen(false)} icon="stock" title={item ? `Edit ${item.sku}` : 'Add item'} wide>
        <form onSubmit={submit} className="lf-form-grid" style={{ marginTop: 0 }}>
          <div className="lf-grid-2">
            <label className="lf-field"><span>SKU</span><input id="it-sku" name="sku" defaultValue={v.sku} disabled={Boolean(item)} required placeholder="SUP-250-2C" /></label>
            <label className="lf-field"><span>Unit</span><input id="it-unit" name="unit" defaultValue={v.unit} placeholder="pcs, kg, rolls" /></label>
          </div>
          <label className="lf-field"><span>Name</span><input id="it-name" name="name" defaultValue={v.name} required placeholder="Stand-up pouch 250 ml, 2 colour" /><small>The matching rule reads this name, so include the size and print, like the buyer writes them.</small></label>
          <div className="lf-grid-2">
            <label className="lf-field"><span>Rate (₹ per unit)</span><input id="it-rate" name="rateRupees" inputMode="decimal" defaultValue={v.rateRupees || ''} required /></label>
            <label className="lf-field"><span>GST %</span><input id="it-gst" name="gstPercent" inputMode="decimal" defaultValue={v.gstPercent} /></label>
            <label className="lf-field"><span>HSN</span><input id="it-hsn" name="hsn" defaultValue={v.hsn ?? ''} /></label>
            <label className="lf-field"><span>On hand</span><input id="it-onhand" name="onHand" inputMode="numeric" defaultValue={v.onHand} /></label>
            <label className="lf-field"><span>Incoming, local</span><input id="it-local" name="incomingLocal" inputMode="numeric" defaultValue={v.incomingLocal} /></label>
            <label className="lf-field"><span>Incoming, import</span><input id="it-import" name="incomingImport" inputMode="numeric" defaultValue={v.incomingImport} /></label>
          </div>
          <div className="lf-modal-foot" style={{ padding: '0.25rem 0' }}>
            <span className="lf-grow">{error}</span>
            <button type="button" className="lf-btn lf-btn-ghost" onClick={() => setOpen(false)}>Cancel</button>
            <button type="submit" className="lf-btn lf-btn-primary" data-busy={busy === 'save'}>{item ? 'Save' : 'Add item'}</button>
          </div>
        </form>
      </Modal>
    </>
  );
}

export function ImportModal() {
  const [open, setOpen] = useState(false);
  const [csv, setCsv] = useState('');
  const [done, setDone] = useState<number | null>(null);
  const { post, busy, error, setError } = useAction();
  return (
    <>
      <button type="button" className="lf-btn lf-btn-ghost" onClick={() => { setError(null); setDone(null); setOpen(true); }}><Icon name="upload" />Import CSV</button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        icon="upload"
        title="Import items from CSV"
        wide
        footer={(
          <>
            <span className="lf-grow">{error ?? (done !== null ? '' : '')}</span>
            {done !== null && <span className="lf-saved">Imported {done} items.</span>}
            <button type="button" className="lf-btn lf-btn-ghost" onClick={() => setOpen(false)}>Close</button>
            <button type="button" className="lf-btn lf-btn-primary" data-busy={busy === 'import'} disabled={!csv.trim()} onClick={async () => {
              const result = await post<{ count: number }>('import', '/api/inventory/import', { csv });
              if (result) setDone(result.count);
            }}>Import</button>
          </>
        )}
      >
        <p className="lf-note">Paste a CSV, for example a Tally stock summary saved as CSV. Forge needs sku, name and rate columns. It also reads unit, gst, hsn, on hand, incoming local and incoming import. A row with an existing SKU updates that item.</p>
        <label className="lf-field">
          <span>CSV</span>
          <textarea id="import-csv" rows={8} value={csv} onChange={(e) => setCsv(e.target.value)} placeholder={'sku,name,unit,rate,gst,on hand\nSUP-250-2C,"Stand-up pouch 250 ml, 2 colour",pcs,3.40,18,12000'} style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem' }} />
        </label>
      </Modal>
    </>
  );
}
