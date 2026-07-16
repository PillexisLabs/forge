export type GaSummary = {
  sessions: number;
  users: number;
  newUsers: number;
  engagedSessions: number;
  bookCallClicks: number;
  leads: number;
};

export type GaSource = {
  source: string;
  medium: string;
  sessions: number;
  users: number;
  bookCallClicks: number;
  leads: number;
};

export type MetaAccount = {
  spend: number;
  impressions: number;
  reach: number;
  clicks: number;
  ctr: number;
  cpc: number;
  schedules: number;
  initiateCheckout: number;
};

export type MetaAd = {
  adId: string;
  adName: string | null;
  campaignId: string | null;
  campaignName: string | null;
  spend: number;
  impressions: number;
  clicks: number;
  ctr: number;
  cpc: number;
  schedules: number;
  costPerSchedule: number | null;
};

// Shapes returned to the dashboard (numbers already coerced from Postgres strings).
export type DailySummaryRow = {
  date: string;
  meta_spend: number;
  meta_impressions: number;
  meta_reach: number;
  meta_clicks: number;
  meta_ctr: number;
  meta_cpc: number;
  meta_schedules: number;
  meta_initiate_checkout: number;
  ga_sessions: number;
  ga_users: number;
  ga_new_users: number;
  ga_engaged_sessions: number;
  ga_book_call_clicks: number;
  ga_leads: number;
  cost_per_booking: number | null;
};

export type AdRow = {
  date: string;
  campaign_name: string | null;
  ad_name: string | null;
  spend: number;
  impressions: number;
  clicks: number;
  ctr: number;
  cpc: number;
  schedules: number;
  cost_per_schedule: number | null;
  last_active: string | null; // last date the ad actually delivered (impressions > 0)
};

export type SourceRow = {
  source: string;
  medium: string;
  sessions: number;
  users: number;
  book_call_clicks: number;
  leads: number;
};

export type PeriodTotals = {
  spend: number;
  impressions: number;
  clicks: number;
  schedules: number;
  sessions: number;
  bookCallClicks: number;
  leads: number;
};

export type SyncRunRow = {
  started_at: string;
  finished_at: string | null;
  trigger: string;
  status: string;
  error_count: number;
  errors: string[];
  duration_ms: number | null;
};
