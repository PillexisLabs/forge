-- Running numbers for documents (tax invoices, purchase orders), one row per
-- series, for example 'INV/2026-27/'. The upsert takes a row lock, so two
-- documents made at once never share a number.
create table if not exists doc_counters (
  series  text primary key,
  last    integer not null
);

-- Purchasing module (pur_ prefix): the suppliers a purchase order can go to.
create table if not exists pur_suppliers (
  id          bigserial primary key,
  name        text not null,
  email       text,
  phone       text,
  -- The catalogue SKUs this supplier supplies. A short item goes to the first match.
  skus        text[] not null default '{}',
  lead_days   integer not null default 7 check (lead_days >= 0),
  active      boolean not null default true,
  fixture     boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
