import Icon from '@/components/lf/Icon';

// Shown next to every send action while a channel is in test mode, so
// nobody believes a buyer received a message that Forge only recorded.
export default function TestModeNote({ reason }: { reason: string | null | undefined }) {
  if (!reason) return null;
  return <div className="tm-note" role="note"><Icon name="bolt" size={14} /><span>{reason}</span></div>;
}
