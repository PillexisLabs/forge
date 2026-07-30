// Shared sidebar navigation for the Forge workspace. Both areas are always
// visible in the sidebar; these static entries provide labels, icons, and
// cross-area links when a section is not the active one.

export type ForgeNavItem = {
  id: string;
  label: string;
  icon: string;
  href: string;
};

export const ANALYTICS_NAV: ForgeNavItem[] = [
  { id: 'overview', label: 'Overview', icon: '/icons/dashboard.svg', href: '/?view=overview' },
  { id: 'funnel', label: 'Funnel', icon: '/icons/roadmap.svg', href: '/?view=funnel' },
  { id: 'ads', label: 'Ads', icon: '/icons/changelog.svg', href: '/?view=ads' },
  { id: 'traffic', label: 'Traffic', icon: '/icons/surveys.svg', href: '/?view=traffic' },
  { id: 'sync', label: 'Sync', icon: '/icons/settings.svg', href: '/?view=sync' },
];

export const CRM_NAV: ForgeNavItem[] = [
  { id: 'today', label: 'Today', icon: '/icons/dashboard.svg', href: '/crm' },
  { id: 'automation', label: 'WhatsApp', icon: '/icons/getting-started.svg', href: '/crm/whatsapp' },
  { id: 'leads', label: 'Leads', icon: '/icons/categories.svg', href: '/crm/leads' },
  { id: 'pipeline', label: 'Pipeline', icon: '/icons/roadmap.svg', href: '/crm/pipeline' },
  { id: 'followups', label: 'Follow ups', icon: '/icons/feedbacks.svg', href: '/crm/follow-ups' },
  { id: 'calls', label: 'Calls', icon: '/icons/surveys.svg', href: '/crm/calls' },
];
