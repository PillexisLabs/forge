import type { ReactNode } from 'react';

export default function SettingsHeader({ title, description, meta, actions }: { title: string; description: string; meta?: string | null; actions?: ReactNode }) {
  return (
    <header className="st-head">
      <div>
        <h1>{title}</h1>
        <p>{description}</p>
        {meta && <p className="st-meta">{meta}</p>}
      </div>
      {actions && <div className="st-head-actions">{actions}</div>}
    </header>
  );
}
