import type { ModuleManifest } from '@/core/manifest';

export const analyticsManifest: ModuleManifest = {
  name: 'analytics',
  version: '1.0.0',
  description: 'GA4 + Meta Ads daily sync, funnel view, and rupee cost per booked call.',
  navLabel: 'Analytics',
  nav: [
    { id: 'overview', label: 'Overview', icon: '/icons/dashboard.svg', href: '/?view=overview' },
    { id: 'funnel', label: 'Funnel', icon: '/icons/funnel.svg', href: '/?view=funnel' },
    { id: 'ads', label: 'Ads', icon: '/icons/megaphone.svg', href: '/?view=ads' },
    { id: 'traffic', label: 'Traffic', icon: '/icons/globe.svg', href: '/?view=traffic' },
    { id: 'sync', label: 'Sync', icon: '/icons/sync.svg', href: '/?view=sync' },
  ],
  events: {
    emits: ['sync.completed'],
    consumes: [],
  },
  configKeys: [
    'GA4_PROPERTY_ID',
    'GA4_HOSTNAME',
    'GOOGLE_APPLICATION_CREDENTIALS_JSON',
    'META_ACCESS_TOKEN',
    'META_AD_ACCOUNT_ID',
    'META_GRAPH_VERSION',
    'SYNC_SECRET',
  ],
};
