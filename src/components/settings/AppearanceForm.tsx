'use client';

import { useState } from 'react';
import Icon from '@/components/lf/Icon';
import { useAction } from '@/components/lf/useAction';
import type { Appearance, TextSize } from '@/core/appearance';
import { Card, Row, SaveBar, Segmented } from './kit';

const PRESETS = [
  { hex: '#b9444c', name: 'Forge red' }, { hex: '#2563eb', name: 'Blue' }, { hex: '#0f766e', name: 'Teal' },
  { hex: '#15803d', name: 'Green' }, { hex: '#7c3aed', name: 'Violet' }, { hex: '#c2410c', name: 'Orange' }, { hex: '#1f2937', name: 'Graphite' },
];

export default function AppearanceForm({ appearance }: { appearance: Appearance }) {
  const [base, setBase] = useState(appearance);
  const [f, setF] = useState(appearance);
  const [saved, setSaved] = useState(false);
  const { post, busy, error } = useAction();
  const set = (patch: Partial<Appearance>) => { setF({ ...f, ...patch }); setSaved(false); };
  const dirty = JSON.stringify(f) !== JSON.stringify(base);

  return (
    <div className="st-stack">
      <Card title="Brand color" description="Buttons, the selected menu item, badges and focus rings use it. It must be dark enough for white text.">
        <Row label="Color" stacked>
          <div className="ap-swatches" style={{ marginTop: 0 }}>
            {PRESETS.map((p) => (
              <button key={p.hex} type="button" className="ap-swatch" data-on={f.brandColor === p.hex} style={{ background: p.hex }} aria-label={p.name} title={p.name} onClick={() => set({ brandColor: p.hex })}>
                {f.brandColor === p.hex && <Icon name="check" />}
              </button>
            ))}
            <label className="ap-custom">
              <input type="color" id="ap-color" value={/^#[0-9a-f]{6}$/i.test(f.brandColor) ? f.brandColor : '#b9444c'} onChange={(e) => set({ brandColor: e.target.value })} aria-label="Custom color" />
              <input className="st-text" id="ap-hex" value={f.brandColor} onChange={(e) => set({ brandColor: e.target.value.trim() })} maxLength={7} style={{ width: '6.5rem', fontFamily: 'var(--font-mono)' }} />
            </label>
          </div>
        </Row>
        <Row label="Preview" stacked>
          <div className="ap-preview" style={{ ['--p' as string]: f.brandColor, marginTop: 0 }}>
            <span className="ap-btn">Approve and send</span>
            <span className="ap-soft">Selected item</span>
            <span className="ap-badge">5</span>
          </div>
        </Row>
      </Card>

      <Card title="Text size" description="For everyone in this workspace.">
        <Row label="Size">
          <Segmented<TextSize> label="Text size" value={f.textSize} onChange={(v) => set({ textSize: v })} options={[{ id: 'small', label: 'Small' }, { id: 'default', label: 'Default' }, { id: 'large', label: 'Large' }]} />
        </Row>
      </Card>

      <div><button type="button" className="lf-btn lf-btn-ghost" onClick={() => set({ brandColor: '#b9444c', textSize: 'default' })}>Reset to the Forge default</button></div>

      <SaveBar
        dirty={dirty} busy={busy === 'save'} error={error} saved={saved}
        onDiscard={() => setF(base)}
        onSave={async () => {
          const ok = await post('save', '/api/settings/appearance', f);
          if (ok) { setBase(f); setSaved(true); window.location.reload(); }
        }}
      />
    </div>
  );
}
