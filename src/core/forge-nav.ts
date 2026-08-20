// Shared sidebar navigation for the Forge workspace. Both areas are always
// visible in the sidebar; these static entries provide labels, icons, and
// cross-area links when a section is not the active one.

export type ForgeNavItem = {
  id: string;
  label: string;
  /** Compact label for the mobile bottom nav; falls back to `label`. */
  shortLabel?: string;
  icon: string;
  href: string;
};

export const ANALYTICS_NAV: ForgeNavItem[] = [
  { id: 'overview', label: 'Overview', icon: '/icons/dashboard.svg', href: '/?view=overview' },
  { id: 'funnel', label: 'Funnel', icon: '/icons/funnel.svg', href: '/?view=funnel' },
  { id: 'ads', label: 'Ads', icon: '/icons/megaphone.svg', href: '/?view=ads' },
  { id: 'traffic', label: 'Traffic', icon: '/icons/globe.svg', href: '/?view=traffic' },
  { id: 'sync', label: 'Sync', icon: '/icons/sync.svg', href: '/?view=sync' },
];

export const CRM_NAV: ForgeNavItem[] = [
  { id: 'today', label: 'Today', icon: '/icons/calendar-day.svg', href: '/crm' },
  { id: 'automation', label: 'WhatsApp', icon: '/icons/whatsapp.svg', href: '/crm/whatsapp' },
  { id: 'leads', label: 'Leads', icon: '/icons/people.svg', href: '/crm/leads' },
  { id: 'pipeline', label: 'Pipeline', icon: '/icons/kanban.svg', href: '/crm/pipeline' },
  { id: 'followups', label: 'Follow ups', shortLabel: 'Follow', icon: '/icons/bell.svg', href: '/crm/follow-ups' },
  { id: 'calls', label: 'Calls', icon: '/icons/phone.svg', href: '/crm/calls' },
];
