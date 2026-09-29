'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import Icon from '@/components/lf/Icon';
import Modal from '@/components/lf/Modal';

// The fallback for an enquiry that arrived outside the integrations, for
// example a phone call. It runs the same intake: Forge matches the items
// and drafts the quote from the message.
export default function NewEnquiryButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const form = Object.fromEntries(new FormData(event.currentTarget).entries());
    const response = await fetch('/api/jobs/quote/cases', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ step: 'recordEnquiry', input: form }),
    });
    const body = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) { setError(body.error ?? 'The enquiry was not saved.'); return; }
    setOpen(false);
    router.push(body.path, { scroll: false });
    router.refresh();
  }

  return (
    <>
      <button type="button" className="lf-btn" onClick={() => setOpen(true)}><Icon name="plus" />New enquiry</button>
      <Modal open={open} onClose={() => setOpen(false)} icon="quote" title="New enquiry">
        <form id="new-enquiry" onSubmit={submit} className="lf-form-grid" style={{ marginTop: 0 }}>
          <div className="lf-grid-2">
            <label className="lf-field"><span>Buyer name</span><input id="ne-name" name="buyerName" required maxLength={120} autoFocus /></label>
            <label className="lf-field"><span>Company</span><input id="ne-company" name="company" maxLength={160} /></label>
            <label className="lf-field"><span>Phone</span><input id="ne-phone" name="phone" inputMode="tel" maxLength={20} placeholder="98450 12345" /></label>
            <label className="lf-field"><span>Came by</span>
              <select id="ne-channel" name="channel" defaultValue="phone">
                <option value="phone">Phone call</option>
                <option value="walk_in">Walk-in</option>
                <option value="whatsapp">WhatsApp</option>
                <option value="email">Email</option>
              </select>
            </label>
          </div>
          <label className="lf-field"><span>What the buyer asked</span><textarea id="ne-message" name="message" required rows={3} maxLength={4000} placeholder="5000 stand-up pouches 250 ml, 2 colour, delivery 560058" /></label>
          <div className="lf-modal-foot" style={{ padding: '0.25rem 0 0.25rem' }}>
            <span className="lf-grow">{error}</span>
            <button type="button" className="lf-btn lf-btn-ghost" onClick={() => setOpen(false)}>Cancel</button>
            <button type="submit" className="lf-btn lf-btn-primary" data-busy={busy}>Create</button>
          </div>
        </form>
      </Modal>
    </>
  );
}
