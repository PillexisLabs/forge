-- RBAC PR A (plans/RBAC.md section 4): the users table, and user attribution
-- on the machine-API audit log. Sessions stay stateless — the cookie carries
-- uid + session_version + issued_at, so there is no sessions table. Revoke a
-- user's sessions by bumping session_version; disable the user to lock them
-- out entirely.

create table users (
  id              bigserial primary key,
  email           text not null unique,
  name            text not null,
  password_hash   text not null,
  role            text not null check (role in ('admin','member','viewer')),
  modules         text[] not null default '{}',
  session_version integer not null default 1,
  status          text not null default 'active' check (status in ('active','disabled')),
  created_at      timestamptz not null default now(),
  last_login_at   timestamptz
);

-- Attribution first, restriction second: audit rows name the acting user.
alter table api_request_log
  add column user_id bigint,
  add column user_email text;
