import Link from 'next/link';
import type { ReactNode } from 'react';
import Icon from './Icon';

// The thin bar at the top of every workspace page: object icon and name,
// saved views, and the page actions on the right.
export default function PageBar({
  icon,
  title,
  views = [],
  actions,
}: {
  icon: string;
  title: string;
  views?: { label: string; href: string; current: boolean }[];
  actions?: ReactNode;
}) {
  return (
    <header className="lf-bar">
      <span className="lf-bar-title"><Icon name={icon} />{title}</span>
      {views.length > 0 && (
        <nav className="lf-bar-views" aria-label={`${title} views`}>
          {views.map((view) => (
            <Link key={view.href} href={view.href} className="lf-view" aria-current={view.current ? 'page' : undefined}>{view.label}</Link>
          ))}
        </nav>
      )}
      {actions && <div className="lf-bar-actions">{actions}</div>}
    </header>
  );
}
