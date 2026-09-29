import type { ModuleManifest } from '@/core/manifest';

export const inventoryManifest: ModuleManifest = {
  name: 'inventory',
  version: '0.1.0',
  description: 'The product catalogue and stock: on hand, local and imported stock on the way, and stock committed to orders.',
  navLabel: 'Stock',
  nav: [
    { id: 'stock', label: 'Stock', icon: 'stock', href: '/inventory' },
  ],
  events: {
    emits: [],
    consumes: ['order.confirmed', 'order.dispatched', 'order.cancelled', 'po.sent', 'po.received'],
  },
  permissions: [],
  configKeys: [],
};
