'use client';

import { useState } from 'react';
import { displayPhone } from '@/components/lf/format';
import Icon from '@/components/lf/Icon';
import { useAction } from '@/components/lf/useAction';
import type { ReplyOption } from '@/core/replies';

// Answer the buyer from the case screen. Forge sends the reply from the
// business number (or the connected mailbox), records it on the case, and
// clears the question. Outside the WhatsApp window it says why it cannot
// send and offers the buyer's WhatsApp chat as a fallback.
export default function ReplyBox({ job, caseId, version, option, phone, placeholder }: {
  job: string;
  caseId: number;
  version: number;
  option: ReplyOption;
  phone: string | null;
  placeholder?: string;
}) {
  const { post, busy, error } = useAction();
  const [text, setText] = useState('');
  const [sent, setSent] = useState<string | null>(null);
  const digits = (phone ?? '').replace(/\D/g, '');

  if (!option.ok) {
    return (
      <div className="rb rb-blocked">
        <span className="rb-note">{option.reason}</span>
        {digits.length >= 11 && <a className="lf-btn" href={`https://wa.me/${digits}`} target="_blank" rel="noreferrer"><Icon name="whatsapp" />Open chat in WhatsApp</a>}
      </div>
    );
  }

  const via = option.channel === 'whatsapp' ? 'WhatsApp' : 'email';
  const closes = option.closesAt ? new Intl.DateTimeFormat('en-IN', { hour: 'numeric', minute: '2-digit', day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' }).format(new Date(option.closesAt)) : null;

  async function send() {
    if (!text.trim()) return;
    const result = await post<{ test: boolean }>('reply', `/api/jobs/${job}/cases/${caseId}/reply`, { text, version });
    if (result) {
      setSent(result.test ? `Recorded. WhatsApp is in test mode, so the buyer did not receive it.` : `Sent on ${via}.`);
      setText('');
    }
  }

  return (
    <div className="rb" data-test={option.testReason ? 'true' : undefined}>
      {option.testReason && <div className="tm-note" role="note"><Icon name="bolt" size={14} /><span>{option.testReason}</span></div>}
      <textarea
        className="rb-input"
        rows={3}
        value={text}
        placeholder={placeholder ?? `Write your reply. Forge sends it on ${via}.`}
        onChange={(e) => { setText(e.target.value); setSent(null); }}
        onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void send(); } }}
        aria-label={`Reply on ${via}`}
      />
      <div className="rb-foot">
        <span className={error ? 'rb-note lf-error' : 'rb-note'}>
          {error ?? sent ?? (option.channel === 'whatsapp' ? `From the business number to ${displayPhone(option.to)}. You can reply until ${closes}.` : `By email to ${option.to}.`)}
        </span>
        <button type="button" className="lf-btn lf-btn-primary" data-busy={busy === 'reply'} disabled={!text.trim() || busy === 'reply'} onClick={() => void send()}>
          <Icon name={option.channel === 'whatsapp' ? 'whatsapp' : 'mail'} />{option.testReason ? 'Send reply (test)' : 'Send reply'}
        </button>
      </div>
    </div>
  );
}
