'use client';

import Image from 'next/image';
import Link from 'next/link';
import type { ReactNode } from 'react';

type ForgeArea = 'analytics' | 'crm';

type ForgeTab<T extends string> = {
  id: T;
  label: string;
  icon: string;
  href?: string;
  attention?: boolean;
};

export default function ForgeShell<T extends string>({
  activeArea,
  title,
  description,
  tabs,
  activeTab,
  onTabChange,
  actions,
  status,
  children,
}: {
  activeArea: ForgeArea;
  title: string;
  description: string;
  tabs: ForgeTab<T>[];
  activeTab: T;
  onTabChange?: (tab: T) => void;
  actions?: ReactNode;
  status?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="forge-shell">
      <aside className="forge-sidebar">
        <Link href="/" className="forge-sidebar-brand" aria-label="Forge home">
          <Image src="/forge-logo.png" alt="" width={24} height={24} priority />
          <span>Forge</span>
          <span className="forge-founder-avatar" aria-label="Anurag and Priyanka">AP</span>
        </Link>

        <div className="forge-workspace-switcher">
          <Image className="forge-workspace-logo" src="/forge-logo.png" alt="" width={32} height={32} />
          <span>Pillexis</span>
        </div>

        <nav className="forge-sidebar-nav" aria-label="Workspace areas">
          <div className="forge-sidebar-route">
            <Link href="/" aria-current={activeArea === 'analytics' ? 'page' : undefined}>
              <Image src="/icons/dashboard.svg" alt="" width={20} height={20} />
              <span>Marketing analytics</span>
            </Link>
            {activeArea === 'analytics' && (
              <div className="forge-sidebar-subnav" aria-label={`${title} views`}>
                {tabs.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    aria-pressed={activeTab === tab.id}
                    onClick={() => onTabChange?.(tab.id)}
                  >
                    <Image src={tab.icon} alt="" width={18} height={18} />
                    <span>{tab.label}</span>
                    {tab.attention && <span className="forge-attention-dot" aria-hidden="true" />}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="forge-sidebar-route">
            <Link href="/crm" aria-current={activeArea === 'crm' ? 'page' : undefined}>
              <Image src="/icons/feedbacks.svg" alt="" width={20} height={20} />
              <span>CRM</span>
            </Link>
            {activeArea === 'crm' && (
              <div className="forge-sidebar-subnav" aria-label={`${title} views`}>
                {tabs.map((tab) => (
                  tab.href ? (
                    <Link
                      key={tab.id}
                      href={tab.href}
                      aria-current={activeTab === tab.id ? 'page' : undefined}
                    >
                      <Image src={tab.icon} alt="" width={18} height={18} />
                      <span>{tab.label}</span>
                      {tab.attention && <span className="forge-attention-dot" aria-hidden="true" />}
                    </Link>
                  ) : (
                    <button
                      key={tab.id}
                      type="button"
                      aria-pressed={activeTab === tab.id}
                      onClick={() => onTabChange?.(tab.id)}
                    >
                      <Image src={tab.icon} alt="" width={18} height={18} />
                      <span>{tab.label}</span>
                      {tab.attention && <span className="forge-attention-dot" aria-hidden="true" />}
                    </button>
                  )
                ))}
              </div>
            )}
          </div>
        </nav>

        <div className="forge-sidebar-section forge-sidebar-bottom">
          <p>Workspace</p>
          <div className="forge-sidebar-note">
            <Image src="/icons/settings.svg" alt="" width={20} height={20} />
            <span>Internal founder workspace</span>
          </div>
        </div>
      </aside>

      <div className="forge-main">
      <header className="forge-topbar">
        <div className="forge-topbar-inner">
          <Link href="/" className="forge-brand" aria-label="Forge home">
            <Image src="/forge-logo.png" alt="" width={28} height={28} priority />
            <span className="forge-brand-name">Forge</span>
          </Link>

          <nav className="forge-area-nav" aria-label="Workspace areas">
            <Link href="/" aria-current={activeArea === 'analytics' ? 'page' : undefined}>
              Analytics
            </Link>
            <Link href="/crm" aria-current={activeArea === 'crm' ? 'page' : undefined}>
              CRM
            </Link>
          </nav>

        </div>
      </header>

      <main className="forge-container">
        <section className="forge-page-heading">
          <div className="min-w-0">
            <h1>{title}</h1>
            <p>{description}</p>
            {status}
          </div>
          {actions && <div className="forge-page-actions">{actions}</div>}
        </section>

        <nav className="forge-tabs" aria-label={`${title} views`}>
          {tabs.map((tab) => (
            tab.href ? (
              <Link
                key={tab.id}
                href={tab.href}
                aria-current={activeTab === tab.id ? 'page' : undefined}
              >
                {tab.attention && <span className="forge-attention-dot" aria-hidden="true" />}
                {tab.label}
              </Link>
            ) : (
              <button
                key={tab.id}
                type="button"
                aria-pressed={activeTab === tab.id}
                onClick={() => onTabChange?.(tab.id)}
              >
                {tab.attention && <span className="forge-attention-dot" aria-hidden="true" />}
                {tab.label}
              </button>
            )
          ))}
        </nav>

        <div className="forge-content">{children}</div>
      </main>
      </div>
    </div>
  );
}
