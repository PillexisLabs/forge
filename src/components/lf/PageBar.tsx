import Link from 'next/link';
import type { ReactNode } from 'react';
import Icon from './Icon';

// The page header: title and description on the left, the page action on
// the right, then a dashed divider and the saved views (ProductLogz rhythm).
export default function PageBar({
  icon,
  title,
  description,
  views = [],
  actions,
}: {
  icon: string;
  title: string;
  description?: string;
  views?: { label: string; href: string; current: boolean; count?: number }[];
  actions?: ReactNode;
}) {
  return (
    <header className="lf-bar">
      <div className="lf-bar-head">
        <div className="lf-bar-text">
          <h1 className="lf-bar-title"><Icon name={icon} />{title}</h1>
          {description && <p className="lf-bar-desc">{description}</p>}
        </div>
        {actions && <div className="lf-bar-actions">{actions}</div>}
      </div>
      {views.length > 0 && (
        <nav className="lf-bar-views" aria-label={`${title} views`}>
          {views.map((view) => (
            <Link key={view.href} href={view.href} className="lf-view" aria-current={view.current ? 'page' : undefined}>
              {view.label}{view.count !== undefined && <span className="lf-view-count">{view.count}</span>}
            </Link>
          ))}
        </nav>
      )}
    </header>
  );
}
