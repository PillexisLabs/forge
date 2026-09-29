import type { ModuleManifest } from '@/core/manifest';

export const ordersManifest: ModuleManifest = {
  name: 'orders',
  version: '0.1.0',
  description: 'Confirmed orders made from accepted quotes, through dispatch or cancellation.',
  navLabel: 'Orders',
  nav: [
    { id: 'orders', label: 'Orders', icon: 'order', href: '/orders' },
  ],
  events: {
    emits: ['order.confirmed', 'order.dispatched', 'order.cancelled'],
    consumes: ['quote.accepted'],
  },
  permissions: [],
  configKeys: [],
};
