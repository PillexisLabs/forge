import { getSettings, saveSettings } from './settings';

// The workspace's look, set in Settings → Appearance: the brand color and
// the text size. The brand color feeds every --ds-primary* token, so buttons,
// the selected nav item, badges and focus rings follow it.

export type TextSize = 'small' | 'default' | 'large';
export type Appearance = { brandColor: string; textSize: TextSize };

export const DEFAULT_APPEARANCE: Appearance = { brandColor: '#b9444c', textSize: 'default' };

/** Root font sizes: every rem in the app scales from this. */
export const TEXT_SIZES: Record<TextSize, { px: number; label: string }> = {
  small: { px: 14, label: 'Small' },
  default: { px: 15, label: 'Default' },
  large: { px: 16, label: 'Large' },
};

export async function getAppearance(): Promise<Appearance> {
  return getSettings('appearance', DEFAULT_APPEARANCE).catch(() => DEFAULT_APPEARANCE);
}

export function parseAppearance(input: Record<string, unknown>): Appearance {
  const hex = String(input.brandColor ?? '').trim().toLowerCase();
  if (!/^#[0-9a-f]{6}$/.test(hex)) throw new Error('The brand color must be a hex color such as #b9444c.');
  const size = input.textSize === 'small' || input.textSize === 'large' ? input.textSize : 'default';
  const { l } = toHsl(hex);
  if (l > 0.72) throw new Error('That color is too light for white button text. Choose a darker shade.');
  return { brandColor: hex, textSize: size };
}

export async function saveAppearance(a: Appearance, actorName: string) {
  await saveSettings('appearance', a as unknown as Record<string, unknown>, actorName);
}

// ---------- palette from one color (pure, for tests) ----------

function toRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function toHex([r, g, b]: [number, number, number]): string {
  return `#${[r, g, b].map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('')}`;
}

function toHsl(hex: string) {
  const [r, g, b] = toRgb(hex).map((v) => v / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  return { l: (max + min) / 2 };
}

function mix(hex: string, with_: string, amount: number): string {
  const a = toRgb(hex);
  const b = toRgb(with_);
  return toHex([0, 1, 2].map((i) => a[i] + (b[i] - a[i]) * amount) as [number, number, number]);
}

/** The --ds-primary* tokens for one brand color. */
export function brandPalette(hex: string): Record<string, string> {
  return {
    '--ds-primary': hex,
    '--ds-primary-hover': mix(hex, '#000000', 0.11),
    '--ds-primary-pressed': mix(hex, '#000000', 0.22),
    '--ds-primary-disabled': mix(hex, '#ffffff', 0.68),
    '--ds-primary-subtle': mix(hex, '#ffffff', 0.9),
    '--ds-primary-soft': mix(hex, '#ffffff', 0.8),
    '--ds-primary-border': mix(hex, '#ffffff', 0.25),
  };
}
