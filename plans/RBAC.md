# Roles and permissions (RBAC)

Status: plan, v1 (2026-08-20)
Priority: **top** — decided by Anurag on 2026-08-20, ahead of the voice module.
Companion: `PLATFORM.md` (core owns auth; manifests declare what modules expose).

## 1. Where we are today

There is no access control beyond one shared password. `src/core/auth.ts` is
single-user by design: any HMAC-valid session cookie grants everything —
analytics, every CRM action, WhatsApp sends, sync triggers. Sessions never
expire and cannot be revoked except by rotating the secret, which logs out
everyone. The only scoped access in the system is the machine API
(`/api/v1/analytics` with per-client keys and an `analytics:read` scope).

## 2. Who needs access (the real personas)

| Persona | Example | Needs | Must not |
|---|---|---|---|
| Founder / admin | Anurag | Everything, including user management and config | — |
| Co-founder / sales | Priyanka | Full CRM + WhatsApp, analytics view | Manage users, change config |
| Contractor / delegate | The WhatsApp handoff person | One or two modules only (e.g. whatsapp + crm) | See ad spend, touch analytics, manage users |
| Read-only stakeholder | Future investor/advisor view | Look, never touch | Any write |
| Client users (later) | Every Foundry copy | Their own admin + members in their repo | — |
| Machines | codex client, integrations | Scoped API endpoints | Anything outside the granted scope |

## 3. The model

Three concepts, kept deliberately small:

1. **Role** — `admin`, `member`, `viewer`. Bundles of capability.
2. **Module allowlist** — an optional per-user list of module names. Empty
   list = all modules. This is what scopes a contractor to whatsapp + crm
   without inventing a fourth role.
3. **Permission string** — `<module>:<action>`, checked at the route. The
   action levels are `read`, `write`, and module-declared special actions
   (e.g. `whatsapp:send`, `analytics:sync`). Core-level permissions use the
   `core:` prefix: `core:users`, `core:config`.

Role → permission mapping (fixed in code, not editable in the UI):

| | read | write | special actions | core:users / core:config |
|---|---|---|---|---|
| admin | ✓ | ✓ | ✓ | ✓ |
| member | ✓ | ✓ | ✓ | ✗ |
| viewer | ✓ | ✗ | ✗ | ✗ |

All checks intersect with the module allowlist: a member scoped to
`[whatsapp, crm]` has no `analytics:read`.

Machine API clients keep their existing mechanism; their scopes use the same
permission strings so one vocabulary covers humans and machines.

## 4. Storage (core tables)

```sql
users (
  id            bigserial primary key,
  email         text not null unique,
  name          text not null,
  password_hash text not null,          -- bcrypt
  role          text not null check (role in ('admin','member','viewer')),
  modules       text[] not null default '{}',  -- empty = all modules
  session_version integer not null default 1,  -- bump to revoke all sessions
  status        text not null default 'active' check (status in ('active','disabled')),
  created_at    timestamptz not null default now(),
  last_login_at timestamptz
)
```

Sessions stay stateless: the cookie payload becomes
`uid.session_version.issued_at` + HMAC, with a 30-day expiry. Revocation =
bump `session_version` (per user) — no sessions table needed. The user row
is fetched per request for role + status; it is one indexed primary-key read.

## 5. Enforcement (server is the boundary, UI is a convenience)

- **Middleware** (`src/middleware.ts`): verifies the cookie signature and
  expiry, then redirects to `/login` on failure. Public paths (webhooks,
  health, login) are unchanged. *Amended during PR A (2026-08-21): the Edge
  runtime cannot reach Postgres, so the middleware stays stateless. The
  database-backed checks — user exists, status is active, session_version
  matches — live in `getSessionUser()` (`src/core/session.ts`) and run in
  every route handler that acts. The route layer is the security boundary,
  which section 5 already required.*
- **Route guards**: one helper, `requirePermission(request, 'crm:write')`,
  used at the top of every mutating API route. Returns 403 with a plain
  message. Read routes get `requirePermission(request, '<module>:read')`.
- **Nav and pages**: the module registry (PR 3 manifests) already builds the
  nav. Filter it by the user's module allowlist and role, so a scoped
  contractor never sees the Analytics area. Direct URL access still hits the
  route guard — hiding is not the security boundary.
- **Actions in the UI**: write controls (stage changes, WhatsApp send/pause,
  sync button) render disabled for viewers. The API rejects regardless.
- **Audit**: every mutating request already flows through the audit path;
  add `user_id` and email to the audit rows so actions are attributable.
  This is the point of RBAC for a two-founder company: attribution first,
  restriction second.

## 6. What each manifest declares (ties into PR 3)

Each module's `manifest.ts` adds a `permissions` field naming its special
actions beyond read/write, e.g. whatsapp declares `['send','pause']`,
analytics declares `['sync']`. Core composes the full permission vocabulary
from the registry — no central list to forget to update.

## 7. Login flow changes

- `/login` becomes email + password (today: password only).
- bcrypt verify, then set the session cookie with uid + session_version.
- 5 attempts per 15 minutes per IP (in-memory counter is enough at this scale).
- Admin creates users from a new **Settings → Users** screen (`core:users`):
  name, email, role, module allowlist, temporary password. Users can change
  their own password. No self-signup, no email flows, no SSO in v1.
- The shared `DASH_PASSWORD` dies at cutover: the migration seeds Anurag as
  admin; he creates Priyanka. One deploy, no dual mode.

## 8. Explicit non-goals for v1

- No SSO / OAuth / magic links. Password + bcrypt is right for 2–5 users.
- No per-record ownership rules (deal-level visibility). Owners on deals
  stay a workflow field, not a security field.
- No custom roles or an editable permission matrix. Three roles + module
  allowlist covers every persona in section 2.
- No multi-tenancy. One deployment = one workspace, per the platform spec.
  Client copies get their own users table with their own admin (Foundry
  seeds it).

## 9. Build order (two PRs)

**PR A — users and sessions** (~1 day)
1. `users` table migration + bcrypt dependency.
2. Token upgrade in `src/core/auth.ts` (uid, session_version, expiry).
3. Email + password login; seed migration creates the Anurag admin from env
   (`SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`, read once, then remove).
4. Middleware loads the user; audit rows gain `user_id`.

**PR B — permissions** (~1–2 days)
5. `requirePermission()` helper + guards on every API route (the route
   inventory is small: crm actions, whatsapp actions, sync, settings).
6. Manifest `permissions` field; nav filtered by role + allowlist.
7. Settings → Users screen (list, create, disable, reset password, edit
   role/allowlist).
8. Viewer-state UI (disabled write controls).

Verification: a `viewer` cannot mutate anything (scripted 403 sweep of all
mutating routes); a member scoped to `[crm]` gets 403 on analytics read; a
disabled user's existing cookie stops working; audit rows show the acting
user; 22 existing tests still pass plus new guard tests.

## 10. Sequencing against the platform work

RBAC is core work and touches every module's routes, so it lands **after
PR 3 (manifests) merges and before the voice module starts** — voice will
then declare its permissions in its manifest from day one instead of being
retrofitted. The voice *spike* (throwaway, outside the app) is not blocked
and can run in parallel as soon as the Twilio/Sarvam keys exist.
