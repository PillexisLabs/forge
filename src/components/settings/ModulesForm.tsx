'use client';

import { useState } from 'react';
import { useAction } from '@/components/lf/useAction';

type Mod = { name: string; label: string; description: string; hasScreens: boolean; on: boolean };

// The two views demos switch between most often.
const PRESETS: { id: string; label: string; detail: string; on: string[] | 'all' }[] = [
  { id: 'client', label: 'Client demo', detail: 'Quotes, orders and stock, with the integrations. What a manufacturer sees.', on: ['sales', 'orders', 'inventory', 'whatsapp', 'sheets', 'email'] },
  { id: 'full', label: 'Full workspace', detail: 'Everything, including the Pillexis CRM and analytics.', on: 'all' },
];

export default function ModulesForm({ modules }: { modules: Mod[] }) {
  const [on, setOn] = useState(() => new Set(modules.filter((m) => m.on).map((m) => m.name)));
  const [saved, setSaved] = useState<string | null>(null);
  const { post, busy, error } = useAction();

  async function apply(next: Set<string>, label: string) {
    setOn(next);
    setSaved(null);
    const ok = await post('save', '/api/settings/modules', { on: [...next] });
    // A full reload so the sidebar picks up the new module list.
    if (ok) { setSaved(label); window.location.reload(); }
  }

  const current = PRESETS.find((p) => {
    const want = p.on === 'all' ? modules.map((m) => m.name) : p.on.filter((n) => modules.some((m) => m.name === n));
    return want.length === on.size && want.every((n) => on.has(n));
  });

  return (
    <>
      <section className="lf-form-section">
        <h2>Quick switch</h2>
        <p>One click before a demo.</p>
        <div className="lf-settings-list" style={{ marginTop: '0.875rem' }}>
          {PRESETS.map((preset) => (
            <div key={preset.id} className="lf-connector">
              <span className="lf-connector-text"><strong>{preset.label}</strong><span>{preset.detail}</span></span>
              {current?.id === preset.id
                ? <span className="lf-status" data-status="connected">Showing now</span>
                : <button type="button" className="lf-btn lf-btn-primary" data-busy={busy === 'save'} onClick={() => apply(new Set(preset.on === 'all' ? modules.map((m) => m.name) : preset.on.filter((n) => modules.some((m) => m.name === n))), preset.label)}>Switch</button>}
            </div>
          ))}
        </div>
      </section>

      <section className="lf-form-section">
        <h2>Each module</h2>
        <div className="lf-form-grid">
          {modules.map((mod) => (
            <label key={mod.name} className="lf-check">
              <input type="checkbox" checked={on.has(mod.name)} onChange={(e) => {
                const next = new Set(on);
                if (e.target.checked) next.add(mod.name); else next.delete(mod.name);
                setOn(next);
              }} />
              <span>{mod.label}{!mod.hasScreens && <span className="lf-dim"> · integration, no screens</span>}<small>{mod.description}</small></span>
            </label>
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginTop: '1.25rem' }}>
          <button type="button" className="lf-btn lf-btn-primary" data-busy={busy === 'save'} onClick={() => apply(on, 'Saved')}>Save</button>
          {saved && <span className="lf-saved">{saved}.</span>}
          {error && <span className="lf-error">{error}</span>}
        </div>
      </section>
    </>
  );
}
