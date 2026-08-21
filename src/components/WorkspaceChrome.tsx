'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { type ForgeNavItem } from '@/core/forge-nav';
import { NAV_MODULES } from '@/modules/registry';
import { crmViewFromRoute } from '@/modules/crm/crm-routes';

type ForgeArea = 'analytics' | 'crm';

// Lives in the root layout so the sidebar and topbar persist across
// navigations — only the page content swaps, which keeps transitions smooth.
export default function WorkspaceChrome({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();

  const isCrm = pathname === '/crm' || pathname.startsWith('/crm/');
  const area: ForgeArea = isCrm ? 'crm' : 'analytics';
  const [openGroup, setOpenGroup] = useState<ForgeArea | null>(area);

  // Entering an area always reveals its views, dropdown-style.
  useEffect(() => {
    setOpenGroup(area);
  }, [area]);

  if (pathname === '/login') return <>{children}</>;

  const analyticsView = searchParams.get('view') ?? 'overview';
  const crmView = pathname === '/crm'
    ? 'today'
    : crmViewFromRoute(pathname.split('/')[2] ?? '') ?? 'today';

  // Sidebar groups come from the module registry: one group per module that
  // declares nav entries in its manifest.
  const groups: { id: ForgeArea; label: string; items: ForgeNavItem[]; activeId: string | null }[] =
    NAV_MODULES.map((mod) => ({
      id: mod.name as ForgeArea,
      label: mod.navLabel ?? mod.name,
      items: mod.nav,
      activeId: area === mod.name ? (mod.name === 'crm' ? crmView : analyticsView) : null,
    }));

  return (
    <div className="forge-shell">
      <aside className="forge-sidebar">
        <Link href="/" className="forge-sidebar-brand" aria-label="Forge home">
          <Image src="/forge-logo.png" alt="" width={24} height={24} priority />
          <span>Forge</span>
          <span className="forge-founder-avatar" aria-label="Anurag and Priyanka">AP</span>
        </Link>

        <nav className="forge-sidebar-nav" aria-label="Workspace navigation">
          {groups.map((group) => {
            const open = openGroup === group.id;
            return (
              <div key={group.id} className="forge-sidebar-group" data-open={open}>
                <button
                  type="button"
                  className="forge-sidebar-group-toggle"
                  aria-expanded={open}
                  onClick={() => {
                    // Opening a section selects its first view; clicking again collapses it.
                    if (open) {
                      setOpenGroup(null);
                    } else {
                      setOpenGroup(group.id);
                      if (area !== group.id) router.push(group.items[0].href);
                    }
                  }}
                >
                  <span>{group.label}</span>
                  <svg viewBox="0 0 12 12" width="10" height="10" aria-hidden="true">
                    <path d="M3 4.5 6 7.5 9 4.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
                {open && group.items.map((item) => (
                  <Link
                    key={item.id}
                    href={item.href}
                    aria-current={group.activeId === item.id ? 'page' : undefined}
                  >
                    <span
                      className="forge-nav-icon"
                      aria-hidden="true"
                      style={{ WebkitMaskImage: `url(${item.icon})`, maskImage: `url(${item.icon})` }}
                    />
                    <span>{item.label}</span>
                  </Link>
                ))}
              </div>
            );
          })}
        </nav>
      </aside>

      {/* Mobile: fixed bottom navigation for the active area's views. */}
      <nav className="forge-bottom-nav" aria-label="Primary views">
        {(NAV_MODULES.find((mod) => mod.name === area)?.nav ?? []).map((item) => {
          const activeId = isCrm ? crmView : analyticsView;
          return (
            <Link
              key={item.id}
              href={item.href}
              aria-current={activeId === item.id ? 'page' : undefined}
            >
              <span
                className="forge-nav-icon"
                aria-hidden="true"
                style={{ WebkitMaskImage: `url(${item.icon})`, maskImage: `url(${item.icon})` }}
              />
              <span>{item.shortLabel ?? item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="forge-main">
        <header className="forge-topbar">
          <div className="forge-topbar-inner">
            <Link href="/" className="forge-brand" aria-label="Forge home">
              <Image src="/forge-logo.png" alt="" width={28} height={28} priority />
              <span className="forge-brand-name">Forge</span>
            </Link>

            <nav className="forge-area-nav" aria-label="Workspace areas">
              <Link href="/" aria-current={area === 'analytics' ? 'page' : undefined}>
                Analytics
              </Link>
              <Link href="/crm" aria-current={area === 'crm' ? 'page' : undefined}>
                CRM
              </Link>
            </nav>
          </div>
        </header>

        {children}
      </div>
    </div>
  );
}
