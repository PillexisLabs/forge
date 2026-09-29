'use client';

import { useRouter } from 'next/navigation';
import type { ReactNode } from 'react';

// A table row that opens its record. The first cell also holds a real link,
// so keyboard and middle-click users can open it too.
export default function ClickRow({ href, selected, children }: { href: string; selected?: boolean; children: ReactNode }) {
  const router = useRouter();
  return (
    <tr data-selected={selected ? 'true' : undefined} onClick={(event) => {
      if ((event.target as HTMLElement).closest('a,button')) return;
      router.push(href, { scroll: false });
    }}>
      {children}
    </tr>
  );
}
