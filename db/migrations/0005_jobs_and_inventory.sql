-- The job engine (core) and the inventory module's tables.
--
-- A job is a defined piece of business work (a quote, an order). Each run of
-- a job is one case. A case only changes through named steps, and every step
-- records its actor: a signed-in user, a rule, or (later) an AI employee.
-- That actor column is the seam for the AI employee model: an employee
-- becomes one more actor kind, with no change to the tables.

create table if not exists cases (
  id             bigserial primary key,
  job            text not null,                       -- 'quote', 'order'
  ref            text unique,                         -- 'Q-1001', set after insert
  state          text not null,
  title          text not null,
  -- Who the next step waits for. A role today ('sales', 'approver',
  -- 'operations'); an employee id later.
  assignee_role  text,
  -- The buyer or other party the case is about.
  subject        jsonb not null default '{}'::jsonb,
  -- The job's working document (quote lines, order lines, totals).
  data           jsonb not null default '{}'::jsonb,
  -- The case this one came from (an order points at its quote).
  parent_case_id bigint references cases(id),
  -- Optimistic lock: a step names the version it saw.
  version        integer not null default 1,
  -- Idempotency for cases created by event consumers.
  source_event_id bigint unique,
  closed_at      timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists idx_cases_job_state on cases (job, state, updated_at desc);
create index if not exists idx_cases_open_assignee on cases (assignee_role, updated_at desc)
  where closed_at is null;

-- One running number per job, so refs read Q-1001, Q-1002 and SO-1001
-- without gaps between jobs. The upsert takes a row lock, so two cases
-- created at once get different numbers.
create table if not exists case_counters (
  job   text primary key,
  last  integer not null
);

create table if not exists case_steps (
  id          bigserial primary key,
  case_id     bigint not null references cases(id) on delete cascade,
  step        text not null,
  actor_kind  text not null check (actor_kind in ('user', 'rule', 'employee')),
  actor_id    text not null,
  actor_name  text not null,
  from_state  text,
  to_state    text not null,
  input       jsonb not null default '{}'::jsonb,
  summary     text not null,
  created_at  timestamptz not null default now()
);

create index if not exists idx_case_steps_case on case_steps (case_id, id);

-- Inventory module (inv_ prefix per the module table rule). The catalogue a
-- client uses when it has no ERP. A Tally connector later provides the same
-- product interface from Tally instead.

create table if not exists inv_items (
  sku             text primary key,
  name            text not null,
  unit            text not null default 'pcs',
  -- Money is stored in paise to keep arithmetic exact.
  rate_paise      bigint not null check (rate_paise >= 0),
  gst_rate_bp     integer not null default 1800,        -- basis points: 1800 = 18%
  hsn             text,
  on_hand         integer not null default 0,
  incoming_local  integer not null default 0,
  incoming_import integer not null default 0,
  active          boolean not null default true,
  fixture         boolean not null default false,
  updated_at      timestamptz not null default now()
);

-- Stock promised to confirmed orders. One row per order line, so a replayed
-- order.confirmed event commits once.
create table if not exists inv_commitments (
  id          bigserial primary key,
  order_ref   text not null,
  sku         text not null references inv_items(sku),
  quantity    integer not null check (quantity > 0),
  status      text not null default 'committed'
    check (status in ('committed', 'dispatched', 'released')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (order_ref, sku)
);

create index if not exists idx_inv_commitments_sku on inv_commitments (sku) where status = 'committed';
