'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { type ForgeNavItem } from '@/core/forge-nav';
import { NAV_MODULES } from '@/modules/registry';
import { crmViewFromRoute } from '@/modules/crm/crm-routes';

// An area is a module name, or one of the core areas 'work' and 'settings'.
type ForgeArea = string;

export type ChromeUser = {
  name: string;
  role: string;
  /** Module allowlist. Empty = all modules. */
  modules: string[];
};

// Core screens are not a module, so they cannot come from the registry.
const WORK_NAV: ForgeNavItem[] = [
  { id: 'work', label: 'My work', icon: '/icons/getting-started.svg', href: '/work' },
];

// Core screens are not a module, so they cannot come from the registry.
// Settings renders for admins only — the route guards enforce it regardless.
const SETTINGS_NAV: ForgeNavItem[] = [
  { id: 'users', label: 'Users', icon: '/icons/people.svg', href: '/settings/users' },
];

// Lives in the root layout so the sidebar and topbar persist across
// navigations — only the page content swaps, which keeps transitions smooth.
export default function WorkspaceChrome({
  user,
  enabledModules,
  children,
}: {
  user: ChromeUser | null;
  /** The instance's module list (FORGE_MODULES). Null = every module. */
  enabledModules: string[] | null;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();

  // The instance's modules, then the user's allowlist (empty = all). Hiding
  // is a convenience — the page and API guards are the boundary.
  const allowedModules = NAV_MODULES.filter(
    (mod) => (enabledModules === null || enabledModules.includes(mod.name))
      && (!user || user.modules.length === 0 || user.modules.includes(mod.name)),
  );
  const hasJobs = allowedModules.some((mod) => ['sales', 'orders', 'inventory'].includes(mod.name));
  const segment = pathname.split('/')[1] ?? '';
  const moduleForPath = allowedModules.find((mod) => mod.nav.some((item) => {
    const base = item.href.split('/')[1] ?? '';
    return base !== '' && base === segment;
  }));
  const area: ForgeArea = segment === 'settings'
    ? 'settings'
    : segment === 'work'
      ? 'work'
      : moduleForPath?.name ?? 'analytics';
  const [openGroup, setOpenGroup] = useState<ForgeArea | null>(area);

  // Entering an area always reveals its views, dropdown-style.
  useEffect(() => {
    setOpenGroup(area);
  }, [area]);

  // Login and printable documents render without the workspace chrome.
  if (pathname === '/login' || pathname.endsWith('/print') || !user) return <>{children}</>;

  const analyticsView = searchParams.get('view') ?? 'overview';
  const crmView = pathname === '/crm'
    ? 'today'
    : crmViewFromRoute(pathname.split('/')[2] ?? '') ?? 'today';
  const settingsView = pathname.split('/')[2] ?? 'users';

  // The active nav item: analytics uses ?view=, CRM its sub-route, and every
  // other module the nav item whose href starts the path.
  function activeIdFor(groupId: string, items: ForgeNavItem[]): string | null {
    if (area !== groupId) return null;
    if (groupId === 'analytics') return analyticsView;
    if (groupId === 'crm') return crmView;
    if (groupId === 'settings') return settingsView;
    const match = [...items]
      .sort((a, b) => b.href.length - a.href.length)
      .find((item) => pathname === item.href || pathname.startsWith(`${item.href}/`));
    return match?.id ?? items[0]?.id ?? null;
  }

  const groups: { id: ForgeArea; label: string; items: ForgeNavItem[]; activeId: string | null }[] = [];
  if (hasJobs) groups.push({ id: 'work', label: 'Work', items: WORK_NAV, activeId: activeIdFor('work', WORK_NAV) });
  for (const mod of allowedModules) {
    groups.push({ id: mod.name, label: mod.navLabel ?? mod.name, items: mod.nav, activeId: activeIdFor(mod.name, mod.nav) });
  }
  if (user.role === 'admin') {
    groups.push({
      id: 'settings',
      label: 'Settings',
      items: SETTINGS_NAV,
      activeId: activeIdFor('settings', SETTINGS_NAV),
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
          const activeId = activeGroup?.activeId;
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
              {groups.map((group) => (
                <Link key={group.id} href={group.items[0].href} aria-current={area === group.id ? 'page' : undefined}>
                  {group.label}
                </Link>
              ))}
            </nav>
          </div>
        </header>

        {children}
      </div>
    </div>
  );
}
