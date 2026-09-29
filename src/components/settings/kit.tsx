'use client';

import { useEffect, type ReactNode } from 'react';

// Settings building blocks. Research basis (Linear, Stripe, Vercel and the
// saasui.design / Eleken settings reviews): titled cards; label and help on
// the left, the control on the right; switches for on/off, segmented
// controls or option cards for choices; one save pattern per page, a save
// bar that appears only when something changed, with Discard and a guard
// against leaving with unsaved edits.

export function Card({ title, description, children, tone }: { title: string; description?: ReactNode; children: ReactNode; tone?: 'danger' }) {
  return (
    <section className="st-card" data-tone={tone}>
      <header className="st-card-head">
        <h2>{title}</h2>
        {description && <p>{description}</p>}
      </header>
      <div className="st-rows">{children}</div>
    </section>
  );
}

export function Row({ label, description, htmlFor, children, stacked = false, disabled = false }: {
  label: ReactNode; description?: ReactNode; htmlFor?: string; children: ReactNode; stacked?: boolean; disabled?: boolean;
}) {
  return (
    <div className="st-row" data-stacked={stacked} data-disabled={disabled}>
      <div className="st-label">
        {htmlFor ? <label htmlFor={htmlFor}>{label}</label> : <span className="st-label-text">{label}</span>}
        {description && <p>{description}</p>}
      </div>
      <div className="st-control">{children}</div>
    </div>
  );
}

export function Switch({ id, checked, onChange, label, disabled }: { id: string; checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button id={id} type="button" role="switch" aria-checked={checked} aria-label={label} disabled={disabled} className="st-switch" onClick={() => onChange(!checked)}>
      <span className="st-switch-knob" />
    </button>
  );
}

export function Segmented<T extends string>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: { id: T; label: string }[]; label: string }) {
  return (
    <div className="st-segmented" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={o.id} type="button" role="radio" aria-checked={value === o.id} className="st-seg" onClick={() => onChange(o.id)}>{o.label}</button>
      ))}
    </div>
  );
}

export function Choices<T extends string>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: { id: T; label: string; detail: string; badge?: string }[]; label: string }) {
  return (
    <div className="st-choices" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={o.id} type="button" role="radio" aria-checked={value === o.id} className="st-choice" onClick={() => onChange(o.id)}>
          <span className="st-radio" aria-hidden="true" />
          <span className="st-choice-text">
            <strong>{o.label}{o.badge && <span className="lf-chip" data-tone="green">{o.badge}</span>}</strong>
            <span>{o.detail}</span>
          </span>
        </button>
      ))}
    </div>
  );
}

/** A number or text field with a unit before or after it (₹, days, %). */
export function Affix({ before, after, children }: { before?: string; after?: string; children: ReactNode }) {
  return (
    <span className="st-affix">
      {before && <span className="st-affix-part">{before}</span>}
      {children}
      {after && <span className="st-affix-part">{after}</span>}
    </span>
  );
}

/** Warn before leaving the page with unsaved edits. */
export function useUnsavedGuard(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
}

export function SaveBar({ dirty, busy, error, saved, onSave, onDiscard }: {
  dirty: boolean; busy: boolean; error: string | null; saved: boolean; onSave: () => void; onDiscard: () => void;
}) {
  useUnsavedGuard(dirty);
  if (!dirty && !saved && !error) return null;
  return (
    <div className="st-savebar" role="status" data-state={error ? 'error' : dirty ? 'dirty' : 'saved'}>
      <span className="st-savebar-text">{error ?? (dirty ? 'You have unsaved changes.' : 'Saved. New work uses these settings.')}</span>
      {dirty && (
        <span className="st-savebar-actions">
          <button type="button" className="lf-btn lf-btn-ghost" onClick={onDiscard} disabled={busy}>Discard</button>
          <button type="button" className="lf-btn lf-btn-primary" data-busy={busy} onClick={onSave}>Save changes</button>
        </span>
      )}
    </div>
  );
}

/** Numbers typed in settings: digits only, empty stays empty while typing. */
export function digits(value: string): string {
  return value.replace(/[^\d]/g, '');
}
