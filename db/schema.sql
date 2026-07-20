-- Pillexis Marketing Analytics schema.
-- Run once against your Postgres (Supabase: SQL Editor → paste → Run).

-- Top-line numbers per day, GA + Meta merged. Drives KPI cards, the funnel,
-- and the cost-per-booking trend.
create table if not exists daily_summary (
  date                    date primary key,
  -- Meta Ads
  meta_spend              numeric  default 0,
  meta_impressions        bigint   default 0,
  meta_reach              bigint   default 0,
  meta_clicks             bigint   default 0,
  meta_ctr                numeric  default 0,
  meta_cpc                numeric  default 0,
  meta_schedules          integer  default 0,   -- bookings attributed to ads (Schedule)
  meta_initiate_checkout  integer  default 0,   -- book-call clicks attributed to ads
  -- Google Analytics
  ga_sessions             integer  default 0,
  ga_users                integer  default 0,
  ga_new_users            integer  default 0,
  ga_engaged_sessions     integer  default 0,
  ga_book_call_clicks     integer  default 0,   -- book_call_clicked event
  ga_leads                integer  default 0,   -- generate_lead event (bookings)
  -- derived
  cost_per_booking        numeric,
  updated_at              timestamptz default now()
);

-- Per-ad Meta breakdown for the latest synced day (and history).
create table if not exists meta_ads_daily (
  date              date    not null,
  campaign_id       text,
  campaign_name     text,
  ad_id             text    not null,
  ad_name           text,
  spend             numeric default 0,
  impressions       bigint  default 0,
  clicks            bigint  default 0,
  ctr               numeric default 0,
  cpc               numeric default 0,
  schedules         integer default 0,
  cost_per_schedule numeric,
  updated_at        timestamptz default now(),
  primary key (date, ad_id)
);

-- GA traffic by source/medium per day.
create table if not exists ga_sources_daily (
  date             date    not null,
  source           text    not null,
  medium           text    not null,
  sessions         integer default 0,
  users            integer default 0,
  book_call_clicks integer default 0,   -- book_call_clicked event, by source
  leads            integer default 0,   -- generate_lead event (bookings), by source
  updated_at       timestamptz default now(),
  primary key (date, source, medium)
);

create index if not exists idx_meta_ads_daily_date on meta_ads_daily (date);
create index if not exists idx_ga_sources_daily_date on ga_sources_daily (date);

-- GA metrics retain the campaign dimension so the dashboard can filter at
-- query time. campaign_key is GA's sessionCampaignName. For Meta campaigns it
-- should be populated through utm_campaign with either the Meta id or name.
create table if not exists ga_campaigns_daily (
  date              date    not null,
  campaign_key      text    not null,
  sessions          integer default 0,
  users             integer default 0,
  engaged_sessions  integer default 0,
  book_call_clicks  integer default 0,
  leads             integer default 0,
  updated_at        timestamptz default now(),
  primary key (date, campaign_key)
);

create table if not exists ga_campaign_sources_daily (
  date              date    not null,
  campaign_key      text    not null,
  source            text    not null,
  medium            text    not null,
  sessions          integer default 0,
  users             integer default 0,
  engaged_sessions  integer default 0,
  book_call_clicks  integer default 0,
  leads             integer default 0,
  updated_at        timestamptz default now(),
  primary key (date, campaign_key, source, medium)
);

create index if not exists idx_ga_campaigns_daily_date on ga_campaigns_daily (date);
create index if not exists idx_ga_campaign_sources_daily_date on ga_campaign_sources_daily (date);

-- Audit log of every sync run (cron / manual / cli) so failures are visible on
-- the dashboard and in queries, not just buried in console logs.
create table if not exists sync_runs (
  id          bigserial primary key,
  started_at  timestamptz not null default now(),
  finished_at timestamptz,
  trigger     text    not null default 'unknown',  -- cli | manual | cron | api
  days        int     not null default 0,
  status      text    not null default 'running',  -- ok | partial | error
  error_count int     not null default 0,
  errors      jsonb   not null default '[]'::jsonb,
  details     jsonb   not null default '[]'::jsonb,
  duration_ms int
);
create index if not exists idx_sync_runs_started on sync_runs (started_at desc);

-- Authenticated API request audit. Secrets and request bodies are never stored.
create table if not exists api_request_log (
  id           bigserial primary key,
  request_id   uuid        not null,
  requested_at timestamptz not null default now(),
  client_id    text,
  route        text        not null,
  scope        text        not null,
  status_code  integer     not null,
  from_date    date,
  to_date      date,
  user_agent   text
);
create index if not exists idx_api_request_log_requested on api_request_log (requested_at desc);
create index if not exists idx_api_request_log_client on api_request_log (client_id, requested_at desc);
