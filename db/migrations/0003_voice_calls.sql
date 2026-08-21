-- The voice module's own table (plans/PLATFORM.md sections 5 and 8).
-- vc_ prefix per the module table rule; references the data spine by id.
-- One row per outbound qualification call attempt.

create table vc_calls (
  id                bigserial primary key,
  deal_id           bigint not null references crm_deals(id) on delete cascade,
  phone             text not null,
  status            text not null default 'queued'
    check (status in ('queued','dialing','in_progress','completed','failed','skipped')),
  -- Outcome vocabulary starts small: qualified | not_qualified | no_answer |
  -- voicemail | error. Kept as free text until the script stabilises.
  outcome           text,
  provider          text not null default 'stub',
  provider_call_id  text,
  transcript        jsonb not null default '[]'::jsonb,
  turn_latency_ms   jsonb not null default '[]'::jsonb,
  skip_reason       text,
  error             text,
  attempts          integer not null default 0,
  next_attempt_at   timestamptz,
  -- One call per triggering lead.qualified event, so a replayed event
  -- (at-least-once delivery) never dials twice.
  source_event_id   bigint unique,
  started_at        timestamptz,
  ended_at          timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index idx_vc_calls_due on vc_calls (next_attempt_at)
  where status = 'queued';
create index idx_vc_calls_deal on vc_calls (deal_id, created_at desc);
