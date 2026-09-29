import type { ModuleManifest } from '@/core/manifest';

export const salesManifest: ModuleManifest = {
  name: 'sales',
  version: '0.1.0',
  description: 'Enquiry to quote: record an enquiry, build a priced quote, get it approved, send it, and record the buyer’s answer.',
  navLabel: 'Sales',
  nav: [
    { id: 'quotes', label: 'Quotes', icon: 'quote', href: '/sales' },
  ],
  events: {
    emits: ['quote.sent', 'quote.accepted'],
    consumes: [],
  },
  // sales:approve — approve a quote above the approval limit (approver only).
  permissions: ['approve'],
  configKeys: [
    'SALES_APPROVAL_LIMIT_RUPEES',
    'SALES_FREIGHT_LOCAL_RUPEES',
    'SALES_FREIGHT_OUTSTATION_RUPEES',
    'SALES_LOCAL_PIN_PREFIXES',
    'SALES_QUOTE_VALID_DAYS',
    'BUSINESS_NAME',
    'BUSINESS_ADDRESS',
    'BUSINESS_GSTIN',
  ],
};
