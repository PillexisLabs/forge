'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import Icon from './Icon';

// A record opens as a sheet over its list, so the list stays in view.
// Escape or the close button returns to the list URL.
export default function Sheet({ closeHref, label, children }: { closeHref: string; label: ReactNode; children: ReactNode }) {
  const router = useRouter();
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape' && !document.querySelector('dialog[open]')) router.push(closeHref, { scroll: false });
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [closeHref, router]);

  return (
    <aside className="lf-sheet" aria-label="Record">
      <div className="lf-sheet-bar">
        <span className="lf-grow">{label}</span>
        <Link href={closeHref} scroll={false} className="lf-btn lf-btn-ghost lf-btn-icon" aria-label="Close"><Icon name="x" /></Link>
      </div>
      <div className="lf-sheet-body">{children}</div>
    </aside>
  );
}
