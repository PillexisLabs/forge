import type { ReactNode } from 'react';
import Icon from './Icon';

export type Tone = 'grey' | 'blue' | 'green' | 'amber' | 'red' | 'violet';

export function Chip({ tone = 'grey', children }: { tone?: Tone; children: ReactNode }) {
  return <span className="lf-chip" data-tone={tone}>{children}</span>;
}

const STATE_TONES: Record<string, Tone> = {
  enquiry: 'violet',
  draft: 'blue',
  awaiting_approval: 'amber',
  approved: 'blue',
  sent: 'grey',
  accepted: 'green',
  lost: 'grey',
  confirmed: 'blue',
  dispatched: 'green',
  cancelled: 'grey',
};

export function StateChip({ state, label }: { state: string; label: string }) {
  return <Chip tone={STATE_TONES[state] ?? 'grey'}>{label}</Chip>;
}

const SOURCE_ICONS: Record<string, string> = {
  whatsapp: 'whatsapp', email: 'mail', sheets: 'sheet', webhook: 'webhook', phone: 'phone', walk_in: 'person', test: 'whatsapp',
};

export function SourceLabel({ source, label }: { source: string; label: string }) {
  return <span className="lf-source"><Icon name={SOURCE_ICONS[source] ?? 'dot'} size={14} />{label}</span>;
}
