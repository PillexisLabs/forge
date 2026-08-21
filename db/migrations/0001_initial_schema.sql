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

-- Pillexis sales CRM. Kept separate from analytics facts so sales mutations
-- cannot alter provider data or attribution calculations.
create table if not exists crm_companies (
  id                  bigserial primary key,
  display_name        text not null,
  legal_name          text,
  domain              text,
  website_url         text,
  gst_number          text,
  registered_address  text,
  notes               text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create unique index if not exists idx_crm_companies_domain
  on crm_companies (lower(domain)) where domain is not null and domain <> '';

create table if not exists crm_contacts (
  id             bigserial primary key,
  company_id     bigint references crm_companies(id) on delete set null,
  name           text not null,
  primary_email  text,
  primary_phone  text,
  job_title      text,
  notes          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create unique index if not exists idx_crm_contacts_email
  on crm_contacts (lower(primary_email)) where primary_email is not null and primary_email <> '';

create table if not exists crm_deals (
  id                    bigserial primary key,
  contact_id            bigint not null references crm_contacts(id) on delete restrict,
  company_id            bigint references crm_companies(id) on delete set null,
  title                 text not null,
  problem_statement     text,
  lead_source           text not null default 'manual',
  source_detail         text,
  stage                 text not null default 'new_lead'
    check (stage in ('new_lead','contacted','intro_call_booked','qualified','discovery_proposed','discovery_won','implementation_proposed','won','nurture','lost')),
  owner                 text not null default 'unassigned'
    check (owner in ('unassigned','anurag','priyanka')),
  estimated_value       numeric,
  last_interaction_at   timestamptz,
  next_action           text,
  next_action_due_at    timestamptz,
  lost_reason           text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create index if not exists idx_crm_deals_stage on crm_deals (stage);
create index if not exists idx_crm_deals_owner_due on crm_deals (owner, next_action_due_at);

create table if not exists crm_activities (
  id           bigserial primary key,
  deal_id      bigint not null references crm_deals(id) on delete cascade,
  contact_id   bigint references crm_contacts(id) on delete set null,
  actor        text not null default 'system',
  type         text not null,
  direction    text check (direction is null or direction in ('inbound','outbound')),
  occurred_at  timestamptz not null default now(),
  subject      text not null,
  body         text,
  source       text not null default 'manual',
  source_id    text,
  metadata     jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now()
);
create index if not exists idx_crm_activities_deal on crm_activities (deal_id, occurred_at desc);
create unique index if not exists idx_crm_activities_source
  on crm_activities (source, source_id) where source_id is not null and source_id <> '';

create table if not exists crm_tasks (
  id            bigserial primary key,
  deal_id       bigint not null references crm_deals(id) on delete cascade,
  owner         text not null default 'unassigned'
    check (owner in ('unassigned','anurag','priyanka')),
  title         text not null,
  due_at        timestamptz not null,
  priority      text not null default 'normal'
    check (priority in ('low','normal','high')),
  status        text not null default 'open'
    check (status in ('open','completed','cancelled')),
  completed_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists idx_crm_tasks_status_due on crm_tasks (status, due_at);

create table if not exists crm_meetings (
  id                       bigserial primary key,
  deal_id                  bigint not null references crm_deals(id) on delete cascade,
  fireflies_transcript_id  text not null unique,
  title                    text not null,
  meeting_at               timestamptz not null,
  duration_minutes         numeric,
  transcript_url           text,
  summary_status           text not null default 'unavailable'
    check (summary_status in ('available','unavailable')),
  short_summary            text,
  overview                 text,
  action_items             text,
  analysis                 jsonb not null default '{}'::jsonb,
  synced_at                timestamptz not null default now()
);
create index if not exists idx_crm_meetings_deal on crm_meetings (deal_id, meeting_at desc);

create table if not exists crm_bookings (
  id               bigserial primary key,
  deal_id          bigint not null references crm_deals(id) on delete cascade,
  cal_booking_uid  text not null unique,
  starts_at        timestamptz not null,
  status           text not null,
  qualification    jsonb not null default '{}'::jsonb,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create table if not exists crm_whatsapp_workflows (
  id                bigserial primary key,
  deal_id           bigint not null unique references crm_deals(id) on delete cascade,
  state             text not null default 'booked'
    check (state in ('booked','awaiting_confirmation','confirmed','attending','attended','rescheduled','cancelled','no_response','nurture','no_show','human_handoff','opted_out','paused')),
  consent_status    text not null default 'unknown'
    check (consent_status in ('unknown','granted','opted_out')),
  enabled           boolean not null default false,
  appointment_at    timestamptz,
  next_message_at   timestamptz,
  last_intent       text,
  handoff_reason    text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists idx_crm_whatsapp_next_message
  on crm_whatsapp_workflows (next_message_at)
  where enabled = true and next_message_at is not null;

-- Event bus (plans/PLATFORM.md section 4): one outbox table. A module emits a
-- row; other modules consume by event name and track their own cursor. Events
-- are append-only — never rename an event or change a field's meaning.
create table if not exists events (
  id          bigserial primary key,
  name        text not null,
  payload     jsonb not null default '{}'::jsonb,
  emitted_by  text not null,
  dedupe_key  text,
  created_at  timestamptz not null default now()
);
create unique index if not exists idx_events_dedupe
  on events (name, dedupe_key) where dedupe_key is not null;
create index if not exists idx_events_name_id on events (name, id);

create table if not exists event_cursors (
  consumer      text primary key,
  last_event_id bigint not null default 0,
  updated_at    timestamptz not null default now()
);
