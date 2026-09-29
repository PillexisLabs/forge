'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import Icon from '@/components/lf/Icon';
import Sheet from '@/components/lf/Sheet';

export type ReviewItem = {
  key: string;
  job: string;
  caseId: number;
  version: number;
  step: string;
  input: Record<string, unknown>;
  href: string;
  kind: string;
  ref: string;
  title: string;
  detail: string;
  why: string | null;
  amount: string | null;
  actionLabel: string;
  /** Safe to include in "Approve all": a quote within the limit. POs and above-limit quotes are one by one. */
  batch: boolean;
};

async function run(item: ReviewItem): Promise<string | null> {
  const response = await fetch(`/api/jobs/${item.job}/cases/${item.caseId}/steps`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ step: item.step, input: item.input, version: item.version }),
  });
  const body = await response.json().catch(() => ({}));
  return response.ok ? null : body.error ?? 'Not approved.';
}

// The batch review, like Lightfield's "record updates to review": every item
// Forge prepared, what it read, and one approve button each, with "Approve
// all" for the quotes that are within the approval limit.
export default function ReviewSheet({ items, closeHref }: { items: ReviewItem[]; closeHref: string }) {
  const router = useRouter();
  const [done, setDone] = useState<Record<string, 'ok' | string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const batch = items.filter((i) => i.batch && !done[i.key]);

  async function approve(list: ReviewItem[], key: string) {
    setBusy(key);
    const next = { ...done };
    for (const item of list) next[item.key] = (await run(item)) ?? 'ok';
    setDone(next);
    setBusy(null);
    router.refresh();
  }

  return (
    <Sheet closeHref={closeHref} label={`${items.length} to review`}>
      <div className="rv-head">
        <h2>Review Forge’s work</h2>
        <p>Each item was prepared from a buyer’s message or a short order. Approving sends it.</p>
      </div>
      <ul className="rv-list">
        {items.map((item) => {
          const state = done[item.key];
          return (
            <li key={item.key} className="rv-item" data-done={state === 'ok'}>
              <div className="rv-top">
                <span className="rv-kind">{item.kind}</span>
                <Link href={item.href} className="lf-ref">{item.ref}</Link>
              </div>
              <div className="rv-main">
                <div className="rv-text">
                  <strong>{item.title}</strong>
                  <span>{item.detail}</span>
                  {item.why && <span className="rv-why"><Icon name="bolt" size={12} />{item.why}</span>}
                </div>
                {item.amount && <span className="rv-amount">{item.amount}</span>}
              </div>
              <div className="rv-actions">
                {state === 'ok' ? <span className="lf-saved"><Icon name="check" size={14} /> Done</span> : (
                  <>
                    {state && <span className="lf-error">{state}</span>}
                    <Link href={item.href} className="lf-btn lf-btn-ghost">Open</Link>
                    <button type="button" className="lf-btn lf-btn-primary" data-busy={busy === item.key} onClick={() => approve([item], item.key)}>{item.actionLabel}</button>
                  </>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      {batch.length > 1 && (
        <div className="rv-foot">
          <span>{batch.length} quotes are within your approval limit.</span>
          <button type="button" className="lf-btn lf-btn-primary" data-busy={busy === 'all'} onClick={() => approve(batch, 'all')}>Approve and send all {batch.length}</button>
        </div>
      )}
    </Sheet>
  );
}
