export const CRM_VIEW_IDS = [
  'today',
  'automation',
  'leads',
  'pipeline',
  'followups',
  'calls',
] as const;

export type CrmView = (typeof CRM_VIEW_IDS)[number];

export const CRM_VIEW_PATHS: Record<CrmView, string> = {
  today: '/crm',
  automation: '/crm/whatsapp',
  leads: '/crm/leads',
  pipeline: '/crm/pipeline',
  followups: '/crm/follow-ups',
  calls: '/crm/calls',
};

const CRM_ROUTE_VIEWS: Record<string, CrmView> = {
  whatsapp: 'automation',
  leads: 'leads',
  pipeline: 'pipeline',
  'follow-ups': 'followups',
  calls: 'calls',
};

export function crmViewFromRoute(value: string) {
  return CRM_ROUTE_VIEWS[value] ?? null;
}
