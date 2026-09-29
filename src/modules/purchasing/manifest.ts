import type { ModuleManifest } from '@/core/manifest';

export const purchasingManifest: ModuleManifest = {
  name: 'purchasing',
  version: '0.1.0',
  description: 'Suppliers and purchase orders. When a confirmed order is short of stock, Forge drafts a purchase order for a person to approve and send.',
  navLabel: 'Purchasing',
  nav: [
    { id: 'purchase-orders', label: 'Purchase orders', shortLabel: 'POs', icon: 'send', href: '/purchasing' },
  ],
  events: {
    emits: ['po.sent', 'po.received'],
    consumes: ['order.confirmed'],
  },
  permissions: [],
  configKeys: [],
};
