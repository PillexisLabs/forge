-- Instance settings, integrations, and the message logs the intake layer
-- writes. All core tables: every module reads them through src/core.

-- Settings a user changes in the app (Settings → Sales rules). Code keeps a
-- default for every key, so a missing row is never an error.
create table if not exists settings (
  key         text primary key,
  value       jsonb not null,
  updated_by  text,
  updated_at  timestamptz not null default now()
);

-- One row per integration (whatsapp, sheets, webhook, email). `config` holds
-- non-secret settings; `secret` holds an AES-GCM ciphertext (src/core/secrets.ts).
create table if not exists integrations (
  id               text primary key,
  enabled          boolean not null default false,
  config           jsonb not null default '{}'::jsonb,
  secret           text,
  status           text not null default 'not_connected'
    check (status in ('not_connected', 'connected', 'error')),
  last_activity_at timestamptz,
  last_error       text,
  cursor           jsonb not null default '{}'::jsonb,   -- poll position (sheet rows, IMAP uid)
  updated_by       text,
  updated_at       timestamptz not null default now()
);

-- Every message that arrived from any integration. The unique key makes
-- intake idempotent: a retried webhook or a re-read sheet row lands once.
create table if not exists inbound_messages (
  id           bigserial primary key,
  source       text not null check (source in ('whatsapp', 'sheets', 'webhook', 'email', 'test')),
  external_id  text not null,
  from_name    text,
  from_phone   text,
  from_email   text,
  company      text,
  subject      text,
  body         text not null,
  received_at  timestamptz not null default now(),
  case_id      bigint references cases(id) on delete set null,
  handled_at   timestamptz,
  note         text,
  raw          jsonb,
  fixture      boolean not null default false,
  unique (source, external_id)
);

create index if not exists idx_inbound_phone on inbound_messages (from_phone, received_at desc);
create index if not exists idx_inbound_case on inbound_messages (case_id, received_at);

-- Every message Forge sent on a channel, with the provider's answer.
create table if not exists outbound_messages (
  id           bigserial primary key,
  channel      text not null check (channel in ('whatsapp', 'email')),
  recipient    text not null,
  body         text not null,
  attachment   text,
  case_id      bigint references cases(id) on delete set null,
  status       text not null check (status in ('sent', 'failed', 'test')),
  provider_id  text,
  error        text,
  created_at   timestamptz not null default now()
);

create index if not exists idx_outbound_case on outbound_messages (case_id, created_at);
