'use client';

import { useState } from 'react';
import { useStep } from '@/components/jobs/useStep';
import { UiAlert, UiButton, UiField } from '@/components/ui/Core';

export default function OrderActions({ caseId, version, steps }: { caseId: number; version: number; steps: string[] }) {
  const { run, pending, error } = useStep('order', caseId, version);
  const [vehicle, setVehicle] = useState('');
  const [reason, setReason] = useState('');
  const [cancelling, setCancelling] = useState(false);

  if (!steps.includes('dispatchOrder') && !steps.includes('cancelOrder')) return null;

  return (
    <section className="job-panel job-next">
      <header className="job-panel-head"><h2>Next step</h2></header>
      <div className="job-next-body">
        {steps.includes('dispatchOrder') && (
          <div className="job-send-row">
            <UiField label="Vehicle number" hint="Optional">
              <input id="vehicle" value={vehicle} maxLength={40} onChange={(event) => setVehicle(event.target.value)} />
            </UiField>
            <UiButton variant="primary" state={pending === 'dispatchOrder' ? 'loading' : 'default'} onClick={() => run('dispatchOrder', { vehicle })}>
              Mark as dispatched
            </UiButton>
          </div>
        )}
        {error && <UiAlert>{error}</UiAlert>}
        {steps.includes('cancelOrder') && (
          cancelling ? (
            <div className="job-inline-form">
              <UiField label="Why is it cancelled">
                <input id="cancel-reason" value={reason} maxLength={1000} onChange={(event) => setReason(event.target.value)} />
              </UiField>
              <div className="job-actions">
                <UiButton variant="danger" state={pending === 'cancelOrder' ? 'loading' : 'default'} onClick={() => run('cancelOrder', { reason })}>
                  Cancel order
                </UiButton>
                <UiButton variant="ghost" onClick={() => setCancelling(false)}>Keep order</UiButton>
              </div>
            </div>
          ) : (
            <div className="job-actions job-actions-quiet">
              <button type="button" className="job-link-button" onClick={() => setCancelling(true)}>Cancel order</button>
            </div>
          )
        )}
      </div>
    </section>
  );
}
