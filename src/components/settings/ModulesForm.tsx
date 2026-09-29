'use client';

import { useState } from 'react';
import { useAction } from '@/components/lf/useAction';
import { Card, Row, SaveBar, Switch } from './kit';

type Mod = { name: string; label: string; description: string; hasScreens: boolean; on: boolean };

const PRESETS: { id: string; label: string; detail: string; on: string[] | 'all' }[] = [
  { id: 'client', label: 'Client demo', detail: 'Quotes, orders, stock and purchasing, with the integrations. What a manufacturer sees.', on: ['sales', 'orders', 'inventory', 'purchasing', 'whatsapp', 'sheets', 'email'] },
  { id: 'full', label: 'Full workspace', detail: 'Everything, including the Pillexis CRM and analytics.', on: 'all' },
];

export default function ModulesForm({ modules }: { modules: Mod[] }) {
  const initial = modules.filter((m) => m.on).map((m) => m.name).sort();
  const [base, setBase] = useState(initial);
  const [on, setOn] = useState(initial);
  const [saved, setSaved] = useState(false);
  const { post, busy, error } = useAction();
  const dirty = JSON.stringify([...on].sort()) !== JSON.stringify(base);
  const namesFor = (p: (typeof PRESETS)[number]) => (p.on === 'all' ? modules.map((m) => m.name) : p.on.filter((n) => modules.some((m) => m.name === n))).sort();
  const current = PRESETS.find((p) => JSON.stringify(namesFor(p)) === JSON.stringify([...base].sort()));

  async function save(next: string[]) {
    const ok = await post('save', '/api/settings/modules', { on: next });
    // A full reload so the sidebar picks up the new module list.
    if (ok) { setBase([...next].sort()); setSaved(true); window.location.reload(); }
  }

  return (
    <div className="st-stack">
      <Card title="Quick switch" description="One click before a demo. It applies at once.">
        {PRESETS.map((p) => (
          <Row key={p.id} label={p.label} description={p.detail}>
            {current?.id === p.id
              ? <span className="lf-status" data-status="connected">Showing now</span>
              : <button type="button" className="lf-btn" data-busy={busy === 'save'} onClick={() => save(namesFor(p))}>Switch</button>}
          </Row>
        ))}
      </Card>

      <Card title="Modules" description="Switched-off modules keep their data and keep receiving messages. Only their screens are hidden.">
        {modules.map((m) => (
          <Row key={m.name} label={<>{m.label}{!m.hasScreens && <span className="lf-dim"> · integration</span>}</>} description={m.description}>
            <Switch id={`mod-${m.name}`} label={m.label} checked={on.includes(m.name)} onChange={(v) => { setOn(v ? [...on, m.name] : on.filter((n) => n !== m.name)); setSaved(false); }} />
          </Row>
        ))}
      </Card>

      <SaveBar dirty={dirty} busy={busy === 'save'} error={error} saved={saved} onDiscard={() => setOn(base)} onSave={() => save(on)} />
    </div>
  );
}
