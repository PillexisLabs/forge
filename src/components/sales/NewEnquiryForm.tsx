'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { UiAlert, UiButton, UiField } from '@/components/ui/Core';

const CHANNELS = [
  ['whatsapp', 'WhatsApp'],
  ['email', 'Email'],
  ['phone', 'Phone call'],
  ['walk_in', 'Walk-in'],
] as const;

export default function NewEnquiryForm() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending(true);
    setError(null);
    try {
      const response = await fetch('/api/jobs/quote/cases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          step: 'recordEnquiry',
          input: Object.fromEntries(form.entries()),
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(body.error ?? 'The enquiry was not saved. Try again.');
        return;
      }
      router.push(body.path);
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="job-panel job-form" onSubmit={submit}>
      <div className="job-form-grid">
        <UiField label="Buyer name">
          <input id="buyerName" name="buyerName" required maxLength={120} autoComplete="off" />
        </UiField>
        <UiField label="Company" hint="Optional">
          <input id="company" name="company" maxLength={160} autoComplete="off" />
        </UiField>
        <UiField label="Phone" hint="Used for the WhatsApp reply">
          <input id="phone" name="phone" inputMode="tel" maxLength={20} placeholder="98450 12345" />
        </UiField>
        <UiField label="Came by">
          <select id="channel" name="channel" defaultValue="whatsapp">
            {CHANNELS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </UiField>
      </div>
      <UiField label="What the buyer asked" hint="Paste the message as it arrived">
        <textarea id="message" name="message" required rows={4} maxLength={4000} />
      </UiField>
      {error && <UiAlert>{error}</UiAlert>}
      <div className="job-actions">
        <UiButton type="submit" variant="primary" state={pending ? 'loading' : 'default'}>Save enquiry</UiButton>
      </div>
    </form>
  );
}
