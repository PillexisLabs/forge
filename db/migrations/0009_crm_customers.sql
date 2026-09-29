-- Customers in the CRM, kept up to date from quotes and orders.
-- A contact becomes a customer when a quote or order links to it. The
-- sales pipeline (crm_deals) is not changed.

alter table crm_contacts add column if not exists delivery_pincode text;
alter table crm_contacts add column if not exists last_case_at timestamptz;

create index if not exists idx_crm_contacts_phone_digits
  on crm_contacts ((regexp_replace(primary_phone, '\D', '', 'g'))) where primary_phone is not null;
create index if not exists idx_crm_companies_name on crm_companies (lower(display_name));

create table if not exists crm_customer_cases (
  case_id     bigint primary key references cases(id) on delete cascade,
  contact_id  bigint not null references crm_contacts(id) on delete cascade,
  company_id  bigint references crm_companies(id) on delete set null,
  job         text not null,
  linked_at   timestamptz not null default now()
);
create index if not exists idx_crm_customer_cases_contact on crm_customer_cases (contact_id);
