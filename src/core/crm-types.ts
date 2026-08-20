export const CRM_STAGES = [
  'new_lead',
  'contacted',
  'intro_call_booked',
  'qualified',
  'discovery_proposed',
  'discovery_won',
  'implementation_proposed',
  'won',
  'nurture',
  'lost',
] as const;

export const CRM_OWNERS = ['unassigned', 'anurag', 'priyanka'] as const;

export const WHATSAPP_WORKFLOW_STATES = [
  'booked',
  'awaiting_confirmation',
  'confirmed',
  'attending',
  'attended',
  'rescheduled',
  'cancelled',
  'no_response',
  'nurture',
  'no_show',
  'human_handoff',
  'opted_out',
  'paused',
] as const;

export const WHATSAPP_CONSENT_STATUSES = ['unknown', 'granted', 'opted_out'] as const;

export type CrmStage = (typeof CRM_STAGES)[number];
export type CrmOwner = (typeof CRM_OWNERS)[number];
export type WhatsAppWorkflowState = (typeof WHATSAPP_WORKFLOW_STATES)[number];
export type WhatsAppConsentStatus = (typeof WHATSAPP_CONSENT_STATUSES)[number];

export type CrmActivity = {
  id: number;
  deal_id: number;
  actor: string;
  type: string;
  direction: 'inbound' | 'outbound' | null;
  occurred_at: string;
  subject: string;
  body: string | null;
  source: string;
};

export type CrmWhatsAppWorkflow = {
  id: number;
  state: WhatsAppWorkflowState;
  consent_status: WhatsAppConsentStatus;
  enabled: boolean;
  appointment_at: string | null;
  next_message_at: string | null;
  last_intent: string | null;
  handoff_reason: string | null;
  updated_at: string;
};

export type CrmDeal = {
  id: number;
  title: string;
  problem_statement: string | null;
  lead_source: string;
  stage: CrmStage;
  owner: CrmOwner;
  estimated_value: number | null;
  last_interaction_at: string | null;
  next_action: string | null;
  next_action_due_at: string | null;
  contact_id: number;
  contact_name: string;
  primary_email: string | null;
  primary_phone: string | null;
  company_id: number | null;
  company_name: string | null;
  company_domain: string | null;
  meeting_count: number;
  latest_meeting_summary: string | null;
  latest_meeting_url: string | null;
  whatsapp: CrmWhatsAppWorkflow | null;
  activities: CrmActivity[];
};

export type CrmWorkspace = {
  deals: CrmDeal[];
  generatedAt: string;
};

export const STAGE_LABELS: Record<CrmStage, string> = {
  new_lead: 'New lead',
  contacted: 'Contacted',
  intro_call_booked: 'Intro call booked',
  qualified: 'Qualified',
  discovery_proposed: 'Discovery proposed',
  discovery_won: 'Discovery won',
  implementation_proposed: 'Implementation proposed',
  won: 'Won',
  nurture: 'Nurture',
  lost: 'Lost',
};

export const OWNER_LABELS: Record<CrmOwner, string> = {
  unassigned: 'Unassigned',
  anurag: 'Anurag',
  priyanka: 'Priyanka',
};

export const WHATSAPP_STATE_LABELS: Record<WhatsAppWorkflowState, string> = {
  booked: 'Ready to queue',
  awaiting_confirmation: 'Awaiting confirmation',
  confirmed: 'Confirmed',
  attending: 'Reminder sequence',
  attended: 'Attended',
  rescheduled: 'Rescheduled',
  cancelled: 'Cancelled',
  no_response: 'No response',
  nurture: 'Nurture',
  no_show: 'No show',
  human_handoff: 'Human handoff',
  opted_out: 'Opted out',
  paused: 'Paused',
};

export const WHATSAPP_CONSENT_LABELS: Record<WhatsAppConsentStatus, string> = {
  unknown: 'Consent unknown',
  granted: 'Consent granted',
  opted_out: 'Opted out',
};
