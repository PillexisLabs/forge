import { UiBadge, type UiTone } from '@/components/ui/Core';
import type { JobDefinition } from '@/core/jobs';

const TONES: Record<string, UiTone> = {
  awaiting_approval: 'warning',
  accepted: 'positive',
  dispatched: 'positive',
  confirmed: 'accent',
  lost: 'neutral',
  cancelled: 'neutral',
};

export default function StateBadge({ def, state }: { def: JobDefinition; state: string }) {
  return <UiBadge tone={TONES[state] ?? 'accent'}>{def.states[state]?.label ?? state}</UiBadge>;
}
