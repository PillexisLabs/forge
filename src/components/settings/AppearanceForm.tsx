'use client';

import { useState } from 'react';
import Icon from '@/components/lf/Icon';
import { useAction } from '@/components/lf/useAction';
import type { Appearance, TextSize } from '@/core/appearance';

const PRESETS = [
  { hex: '#b9444c', name: 'Forge red' },
  { hex: '#2563eb', name: 'Blue' },
  { hex: '#0f766e', name: 'Teal' },
  { hex: '#15803d', name: 'Green' },
  { hex: '#7c3aed', name: 'Violet' },
  { hex: '#c2410c', name: 'Orange' },
  { hex: '#1f2937', name: 'Graphite' },
];

const SIZES: { id: TextSize; label: string; px: number }[] = [
  { id: 'small', label: 'Small', px: 14 },
  { id: 'default', label: 'Default', px: 15 },
  { id: 'large', label: 'Large', px: 16 },
];

export default function AppearanceForm({ appearance }: { appearance: Appearance }) {
  const [color, setColor] = useState(appearance.brandColor);
  const [size, setSize] = useState<TextSize>(appearance.textSize);
  const [saved, setSaved] = useState(false);
  const { post, busy, error } = useAction();

  return (
    <>
      <section className="lf-form-section">
        <h2>Brand color</h2>
        <p>Buttons, the selected menu item, badges and focus rings use it. Choose a color dark enough for white text.</p>
        <div className="ap-swatches">
          {PRESETS.map((p) => (
            <button key={p.hex} type="button" className="ap-swatch" data-on={color === p.hex} style={{ background: p.hex }} aria-label={p.name} title={p.name} onClick={() => { setColor(p.hex); setSaved(false); }}>
              {color === p.hex && <Icon name="check" />}
            </button>
          ))}
          <label className="ap-custom">
            <input type="color" id="ap-color" value={color} onChange={(e) => { setColor(e.target.value); setSaved(false); }} />
            <input className="lf-input" id="ap-hex" value={color} onChange={(e) => { setColor(e.target.value.trim()); setSaved(false); }} maxLength={7} />
          </label>
        </div>
        <div className="ap-preview" style={{ ['--p' as string]: color }}>
          <span className="ap-btn">Approve and send</span>
          <span className="ap-soft">Selected item</span>
          <span className="ap-badge">5</span>
        </div>
      </section>

      <section className="lf-form-section">
        <h2>Text size</h2>
        <div className="lf-bar-views" style={{ marginLeft: 0, marginTop: '0.75rem', display: 'inline-flex' }}>
          {SIZES.map((s) => (
            <button key={s.id} type="button" className="lf-view" aria-current={size === s.id ? 'page' : undefined} style={{ fontSize: `${s.px * 0.875}px`, cursor: 'pointer', background: size === s.id ? undefined : 'transparent' }} onClick={() => { setSize(s.id); setSaved(false); }}>
              {s.label}
            </button>
          ))}
        </div>
      </section>

      <div className="lf-form-section" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <button type="button" className="lf-btn lf-btn-primary" data-busy={busy === 'save'} onClick={async () => {
          const ok = await post('save', '/api/settings/appearance', { brandColor: color, textSize: size });
          if (ok) { setSaved(true); window.location.reload(); }
        }}>Save</button>
        <button type="button" className="lf-btn lf-btn-ghost" onClick={() => { setColor('#b9444c'); setSize('default'); setSaved(false); }}>Reset to Forge default</button>
        {saved && <span className="lf-saved">Saved.</span>}
        {error && <span className="lf-error">{error}</span>}
      </div>
    </>
  );
}
