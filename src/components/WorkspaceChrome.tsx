'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { type ReactNode } from 'react';
import Icon from '@/components/lf/Icon';
import { type ForgeNavItem } from '@/core/forge-nav';
import { NAV_MODULES } from '@/modules/registry';
import { crmViewFromRoute } from '@/modules/crm/crm-routes';

export type ChromeUser = {
  name: string;
  role: string;
  /** Module allowlist. Empty = all modules. */
  modules: string[];
};

// The job modules share one "Work" group; other modules keep their own group.
const WORK_MODULES = ['sales', 'orders', 'inventory', 'purchasing'];

type NavGroup = { id: string; label: string | null; items: ForgeNavItem[] };

function NavIcon({ icon }: { icon: string }) {
  if (icon.startsWith('/')) {
    return <span className="side-mask" aria-hidden="true" style={{ WebkitMaskImage: `url(${icon})`, maskImage: `url(${icon})` }} />;
  }
  return <Icon name={icon} />;
}

// Lives in the root layout so the sidebar persists across navigations. The
// layout follows Lightfield's sidebar: flat groups with sentence-case labels,
// and Settings at the bottom left. Inside /settings the sidebar switches to
// the settings pages, with a back link.
export default function WorkspaceChrome({
  user,
  enabledModules,
  attention = 0,
  children,
}: {
  user: ChromeUser | null;
  /** The instance's module list (FORGE_MODULES). Null = every module. */
  enabledModules: string[] | null;
  /** Open items that wait for a person, shown on "Up next". */
  attention?: number;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();

  if (pathname === '/login' || pathname.endsWith('/print') || !user) return <>{children}</>;

  const allowed = NAV_MODULES.filter(
    (mod) => (enabledModules === null || enabledModules.includes(mod.name))
      && (user.modules.length === 0 || user.modules.includes(mod.name)),
  );
  const hasJobs = allowed.some((mod) => WORK_MODULES.includes(mod.name));
  const isAdmin = user.role === 'admin';
  const settingsMode = pathname === '/settings' || pathname.startsWith('/settings/');

  const groups: NavGroup[] = [];
  if (hasJobs) {
    groups.push({ id: 'top', label: null, items: [
      { id: 'work', label: 'Up next', icon: 'upnext', href: '/work' },
      { id: 'dashboard', label: 'Dashboard', icon: 'chart', href: '/dashboard' },
    ] });
    groups.push({
      id: 'work',
      label: 'Work',
      items: allowed.filter((mod) => WORK_MODULES.includes(mod.name)).flatMap((mod) => mod.nav),
    });
  }
  for (const mod of allowed.filter((m) => !WORK_MODULES.includes(m.name))) {
    groups.push({ id: mod.name, label: mod.navLabel ?? mod.name, items: mod.nav });
  }

  const settingsItems: ForgeNavItem[] = [
    { id: 'integrations', label: 'Integrations', icon: 'plug', href: '/settings/integrations' },
    ...(allowed.some((m) => m.name === 'sales') ? [{ id: 'sales-rules', label: 'Sales rules', icon: 'sliders', href: '/settings/sales-rules' }] : []),
    ...(allowed.some((m) => m.name === 'orders') ? [{ id: 'orders-payments', label: 'Orders & payments', icon: 'order', href: '/settings/orders' }] : []),
    { id: 'modules', label: 'Modules', icon: 'stock', href: '/settings/modules' },
    { id: 'appearance', label: 'Appearance', icon: 'sliders', href: '/settings/appearance' },
    { id: 'users', label: 'Members', icon: 'users', href: '/settings/users' },
  ];

  function isActive(item: ForgeNavItem): boolean {
    const [path, query] = item.href.split('?');
    if (path === '/' && query) {
      if (pathname !== '/') return false;
      const view = new URLSearchParams(query).get('view');
      return (searchParams.get('view') ?? 'overview') === view;
    }
    if (path === '/crm') return pathname === '/crm';
    if (path.startsWith('/crm/')) return crmViewFromRoute(pathname.split('/')[2] ?? '') !== null && pathname === path;
    return pathname === path || pathname.startsWith(`${path}/`);
  }

  const mobileItems = settingsMode
    ? settingsItems
    : groups.flatMap((group) => group.items).filter((item) => !item.href.startsWith('/?') || isActive(item)).slice(0, 5);

  async function signOut() {
    await fetch('/api/logout', { method: 'POST' });
    router.replace('/login');
    router.refresh();
  }

  const initials = user.name.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase();

  return (
    <div className="forge-shell">
      <aside className="side" aria-label="Workspace navigation">
        {settingsMode ? (
          <>
            <Link href={hasJobs ? '/work' : '/'} className="side-head side-back">
              <Icon name="back" />
              <span>Settings</span>
            </Link>
            <nav className="side-nav">
              <div className="side-group">
                <p className="side-label">Workspace</p>
                {settingsItems.map((item) => (
                  <Link key={item.id} href={item.href} className="side-item" aria-current={isActive(item) ? 'page' : undefined}>
                    <NavIcon icon={item.icon} />
                    <span>{item.label}</span>
                  </Link>
                ))}
              </div>
            </nav>
          </>
        ) : (
          <>
            <Link href={hasJobs ? '/work' : '/'} className="side-head" aria-label="Forge home">
              <Image src="/forge-logo.png" alt="" width={20} height={20} priority />
              <span>Forge</span>
            </Link>
            <nav className="side-nav">
              {groups.map((group) => (
                <div key={group.id} className="side-group">
                  {group.label && <p className="side-label">{group.label}</p>}
                  {group.items.map((item) => (
                    <Link key={item.id} href={item.href} className="side-item" aria-current={isActive(item) ? 'page' : undefined}>
                      <NavIcon icon={item.icon} />
                      <span>{item.label}</span>
                      {item.id === 'work' && attention > 0 && <span className="side-count">{attention}</span>}
                    </Link>
                  ))}
                </div>
              ))}
            </nav>
          </>
        )}

        <div className="side-foot">
          {isAdmin && !settingsMode && (
            <Link href="/settings/integrations" className="side-item">
              <Icon name="settings" />
              <span>Settings</span>
            </Link>
          )}
          <div className="side-user">
            <span className="side-avatar" aria-hidden="true">{initials}</span>
            <span className="side-user-name">{user.name}</span>
            <button type="button" className="side-icon-button" onClick={signOut} aria-label="Sign out" title="Sign out">
              <Icon name="logout" />
            </button>
          </div>
        </div>
      </aside>

      {/* Mobile: fixed bottom navigation. */}
      <nav className="forge-bottom-nav" aria-label="Primary views">
        {mobileItems.map((item) => (
          <Link key={item.id} href={item.href} aria-current={isActive(item) ? 'page' : undefined}>
            <NavIcon icon={item.icon} />
            <span>{item.shortLabel ?? item.label}</span>
          </Link>
        ))}
        {isAdmin && !settingsMode && (
          <Link href="/settings/integrations">
            <Icon name="settings" />
            <span>Settings</span>
          </Link>
        )}
      </nav>

      <div className="forge-main">{children}</div>
    </div>
  );
}
