'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { type ForgeNavItem } from '@/core/forge-nav';
import { NAV_MODULES } from '@/modules/registry';
import { crmViewFromRoute } from '@/modules/crm/crm-routes';

type ForgeArea = 'analytics' | 'crm' | 'settings';

export type ChromeUser = {
  name: string;
  role: string;
  /** Module allowlist. Empty = all modules. */
  modules: string[];
};

// Core screens are not a module, so they cannot come from the registry.
// Settings renders for admins only — the route guards enforce it regardless.
const SETTINGS_NAV: ForgeNavItem[] = [
  { id: 'users', label: 'Users', icon: '/icons/people.svg', href: '/settings/users' },
];

// Lives in the root layout so the sidebar and topbar persist across
// navigations — only the page content swaps, which keeps transitions smooth.
export default function WorkspaceChrome({
  user,
  children,
}: {
  user: ChromeUser | null;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();

  const isCrm = pathname === '/crm' || pathname.startsWith('/crm/');
  const isSettings = pathname === '/settings' || pathname.startsWith('/settings/');
  const area: ForgeArea = isCrm ? 'crm' : isSettings ? 'settings' : 'analytics';
  const [openGroup, setOpenGroup] = useState<ForgeArea | null>(area);

  // Entering an area always reveals its views, dropdown-style.
  useEffect(() => {
    setOpenGroup(area);
  }, [area]);

  if (pathname === '/login' || !user) return <>{children}</>;

  const analyticsView = searchParams.get('view') ?? 'overview';
  const crmView = pathname === '/crm'
    ? 'today'
    : crmViewFromRoute(pathname.split('/')[2] ?? '') ?? 'today';
  const settingsView = pathname.split('/')[2] ?? 'users';

  // Sidebar groups come from the module registry, filtered by the user's
  // module allowlist (empty = all). Hiding is a convenience — the page and
  // API guards are the boundary.
  const allowedModules = NAV_MODULES.filter(
    (mod) => user.modules.length === 0 || user.modules.includes(mod.name),
  );
  const groups: { id: ForgeArea; label: string; items: ForgeNavItem[]; activeId: string | null }[] =
    allowedModules.map((mod) => ({
      id: mod.name as ForgeArea,
      label: mod.navLabel ?? mod.name,
      items: mod.nav,
      activeId: area === mod.name ? (mod.name === 'crm' ? crmView : analyticsView) : null,
    }));
  if (user.role === 'admin') {
    groups.push({
      id: 'settings',
      label: 'Settings',
      items: SETTINGS_NAV,
      activeId: area === 'settings' ? settingsView : null,
    });
  }

  const activeGroup = groups.find((group) => group.id === area) ?? groups[0];

  async function signOut() {
    await fetch('/api/logout', { method: 'POST' });
    router.replace('/login');
    router.refresh();
  }

  return (
    <div className="forge-shell">
      <aside className="forge-sidebar">
        <Link href="/" className="forge-sidebar-brand" aria-label="Forge home">
          <Image src="/forge-logo.png" alt="" width={24} height={24} priority />
          <span>Forge</span>
          <span className="forge-founder-avatar" aria-label={user.name} title={user.name}>
            {user.name.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase()}
          </span>
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

        <div className="forge-sidebar-user">
          <div className="forge-sidebar-user-meta">
            <span className="forge-sidebar-user-name">{user.name}</span>
            <span className="forge-sidebar-user-role">{user.role}</span>
          </div>
          <button type="button" onClick={signOut} className="forge-sidebar-signout">
            Sign out
          </button>
        </div>
      </aside>

      {/* Mobile: fixed bottom navigation for the active area's views. */}
      <nav className="forge-bottom-nav" aria-label="Primary views">
        {(activeGroup?.items ?? []).map((item) => {
          const activeId = area === 'crm' ? crmView : area === 'settings' ? settingsView : analyticsView;
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
              {allowedModules.some((mod) => mod.name === 'analytics') && (
                <Link href="/" aria-current={area === 'analytics' ? 'page' : undefined}>
                  Analytics
                </Link>
              )}
              {allowedModules.some((mod) => mod.name === 'crm') && (
                <Link href="/crm" aria-current={area === 'crm' ? 'page' : undefined}>
                  CRM
                </Link>
              )}
              {user.role === 'admin' && (
                <Link href="/settings/users" aria-current={area === 'settings' ? 'page' : undefined}>
                  Settings
                </Link>
              )}
            </nav>
          </div>
        </header>

        {children}
      </div>
    </div>
  );
}
