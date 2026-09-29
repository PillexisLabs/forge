'use client';

import { useRouter } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import Icon from '@/components/lf/Icon';
import Modal from '@/components/lf/Modal';

// Buttons that run one job step. Every button in a case sheet is one of
// these, so the screen never writes case data directly.

async function postStep(job: string, caseId: number, version: number, step: string, input: Record<string, unknown>) {
  const response = await fetch(`/api/jobs/${job}/cases/${caseId}/steps`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ step, input, version }),
  });
  const body = await response.json().catch(() => ({}));
  return response.ok ? null : (body.error as string) ?? 'The step failed. Try again.';
}

export function StepButton({
  job, caseId, version, step, input = {}, children, variant = 'default', icon,
}: {
  job: string; caseId: number; version: number; step: string; input?: Record<string, unknown>;
  children: ReactNode; variant?: 'default' | 'primary' | 'ghost' | 'danger'; icon?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <button
        type="button"
        className={`lf-btn${variant === 'primary' ? ' lf-btn-primary' : variant === 'ghost' ? ' lf-btn-ghost' : variant === 'danger' ? ' lf-btn-danger' : ''}`}
        data-busy={busy}
        onClick={async () => {
          setBusy(true);
          const failed = await postStep(job, caseId, version, step, input);
          setBusy(false);
          setError(failed);
          if (!failed) router.refresh();
        }}
      >
        {icon && <Icon name={icon} />}{children}
      </button>
      {error && <span className="lf-error">{error}</span>}
    </>
  );
}

/** A step that needs one short text input: opens a small modal first. */
export function PromptStepButton({
  job, caseId, version, step, field, label, title, icon = 'edit', required = true, children, variant = 'default', confirmLabel,
}: {
  job: string; caseId: number; version: number; step: string; field: string; label: string; title: string;
  icon?: string; required?: boolean; children: ReactNode; variant?: 'default' | 'primary' | 'ghost' | 'danger'; confirmLabel: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <button type="button" className={`lf-btn${variant === 'primary' ? ' lf-btn-primary' : variant === 'ghost' ? ' lf-btn-ghost' : variant === 'danger' ? ' lf-btn-danger' : ''}`} onClick={() => { setOpen(true); setValue(''); setError(null); }}>
        {children}
      </button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        icon={icon}
        title={title}
        footer={(
          <>
            {error && <span className="lf-grow">{error}</span>}
            <button type="button" className="lf-btn lf-btn-ghost" onClick={() => setOpen(false)}>Cancel</button>
            <button
              type="button"
              className="lf-btn lf-btn-primary"
              data-busy={busy}
              disabled={required && !value.trim()}
              onClick={async () => {
                setBusy(true);
                const failed = await postStep(job, caseId, version, step, { [field]: value });
                setBusy(false);
                if (failed) setError(failed);
                else { setOpen(false); router.refresh(); }
              }}
            >
              {confirmLabel}
            </button>
          </>
        )}
      >
        <label className="lf-field">
          <span>{label}</span>
          <input id={`${step}-${field}`} value={value} onChange={(event) => setValue(event.target.value)} autoFocus />
        </label>
      </Modal>
    </>
  );
}

/** Copy text to the clipboard, with a quiet confirmation. */
export function CopyButton({ text, children }: { text: string; children: ReactNode }) {
  const [copied, setCopied] = useState(false);
  return (
    <button type="button" className="lf-btn" onClick={async () => {
      try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { setCopied(false); }
    }}>
      {copied ? 'Copied' : children}
    </button>
  );
}
