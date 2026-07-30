'use client';

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

// Page frame: heading, mobile view tabs, and content. The persistent sidebar
// and topbar live in WorkspaceChrome (root layout) so they survive navigation.
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
    <main className="forge-container" data-area={activeArea}>
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
  );
}
