'use client';

import { useState } from 'react';
import { StepButton } from '@/components/jobs/StepControls';

// Choose (or confirm) the supplier, then approve and send.
export default function ApprovePo({ caseId, version, supplierId, suppliers }: { caseId: number; version: number; supplierId: number | null; suppliers: { id: number; name: string; email: string | null }[] }) {
  const [id, setId] = useState<number | null>(supplierId);
  const chosen = suppliers.find((s) => s.id === id);
  return (
    <div className="lf-review-actions" style={{ alignItems: 'center' }}>
      <label className="lf-field" style={{ minWidth: '14rem', marginRight: 'auto' }}>
        <select id="po-supplier" value={id ?? ''} onChange={(e) => setId(Number(e.target.value) || null)}>
          <option value="">Choose a supplier</option>
          {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}{s.email ? '' : ' (no email)'}</option>)}
        </select>
      </label>
      {chosen && !chosen.email && <span className="lf-note">No email: you send the PDF yourself.</span>}
      <StepButton job="purchase" caseId={caseId} version={version} step="approveAndSend" input={{ supplierId: id }} variant="primary" icon="send">Approve and send</StepButton>
    </div>
  );
}
