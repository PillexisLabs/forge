# Forge

The Pillexis delivery platform: reusable modules (analytics, CRM + lead pipeline,
WhatsApp automation, AI voice calling next) built on a shared core, demoed live on
sales calls, and copied into client repositories on engagement. The contract and
build order live in `plans/PLATFORM.md`; the team explainer is
`plans/forge-platform-architecture.html`. Code layout: `src/core/` (shared
foundation and the event bus) + `src/modules/<name>/` (one folder per module,
no cross-module imports — enforced by ESLint).

The first module is the analytics dashboard this repo started as: it pulls
**Google Analytics 4** and **Meta Ads** daily and joins
them on the one metric that matters: **cost per booked call** (the `Schedule` conversion).
It doesn't just chart numbers — a rule-based insights engine tells you *what's converting,
where the funnel leaks, and what to do next.*

```
Meta impressions → clicks → GA sessions → book-call clicks → Schedule (booking)
                                                                    │
                              North star:  Meta spend ÷ bookings  =  ₹ cost per booked call
```

Stack: **Next.js 14** (App Router) · **Postgres** · **Tremor** charts. Separate from the
public marketing site so ad-spend data and API secrets stay private. Forge also includes
a focused internal sales CRM for the two founders.

## Git repository boundary

This `forge/` directory is an independent Git repository. Run its Git and GitHub commands from this directory, or use `git -C forge ...` from the Pillexis workspace root. The workspace root is not a Git repository. The sibling `website/` directory is a separate repository with different branches, remotes, and deployment rules. Never combine Forge and website changes in one commit or pull request.

**Hard GitHub account rule:** This repository belongs to `anurag619`, and every GitHub operation must use that account. The `anuragrk10` account belongs to a different organization and must never be used for this repository. Before any `gh` mutation, verify or switch with `gh auth switch -h github.com -u anurag619`.

> See [`PROGRESS.md`](PROGRESS.md) for the running changelog, known issues, and backlog.
> See [`AGENTS.md`](AGENTS.md) for branch, deployment, organization, and verification rules.
> See [`plans/ROADMAP.md`](plans/ROADMAP.md) for the canonical implementation order. Staging isolation is Priority 0.

---

## Deployment model

Railway is the only scheduled runtime. Run the dashboard as a web service, attach Railway Postgres, and run sync as a separate Railway cron service. Local commands remain available for development and one-off diagnostics, but no local server or sync job runs automatically.

For hosting, treat this as **two services from one repo**:

1. **Web service** — serves the Next.js dashboard.
2. **Sync service** — runs `npm run sync -- 8` on a cron schedule and exits.

That split matches Railway's current model for cron jobs: scheduled services should run a task and terminate when finished.

### Current Railway environments

| Environment | Git branch | Web URL | Purpose |
|-------------|------------|---------|---------|
| Staging | `staging` | https://forge-staging-7d05.up.railway.app | Ongoing development and device testing |
| Production | `master` | https://forge-production-fc70.up.railway.app | Stable live dashboard |

Both environments contain `forge`, `forge-sync`, and Postgres services. Their deployment triggers are isolated: staging follows `staging`, production follows `master`. Develop on `staging`, verify the Railway rollout and authenticated flows, then merge into `master` to promote.

---

## Features

**Navigation:** desktop uses one ProductLogz-style workspace sidebar for analytics and the sales CRM. Mobile uses a compact top bar and scrollable view tabs.

| View | What it answers |
|------|-----------------|
| **Overview** | Sync health + KPIs + "What's happening" insights + funnel + trend, in one screen |
| **Funnel** | Clicks → Sessions → Book-call clicks → Bookings, with the **biggest leak highlighted** |
| **Ads** | Per-ad Meta breakdown (spend, CTR, bookings, cost/booking) |
| **Traffic** | GA sources with **per-source conversions** (book-call clicks, bookings, conv. rate) |
| **Sync** | History of every sync run — status, trigger, duration, expandable errors |

**Analysis & UX:**
- **Insights engine** (`src/modules/analytics/insights.ts`) — prioritized plain-English findings (critical → warning → good → info), each with a "→ Do" action. Detects spend-with-no-conversions, the worst funnel leak, best/worst ads, CTR health, click→session drop-off, and range trends.
- **KPI cards** — Cost per booked call, Session→booking rate, Ad spend, Book-call intent — each with **period-over-period delta** badges (vs the previous equal-length range).
- **Date range** — Last 7 / 30 / 90 days + custom; everything (KPIs, funnel, tables, insights) recomputes for the range. State lives in the URL (`?from=&to=`).
- **Responsive dashboard** — mobile uses a 2 by 2 KPI grid, compact insights, and stacked Ads and Traffic metric cards instead of compressed tables. Custom date inputs stay collapsed until requested.
- **Installable PWA** — manifest, favicon, iOS home-screen icon, standalone display, and a network-only service worker that never caches authenticated analytics data.
- **Light workspace theme** shared by analytics, the sales CRM, login, and setup states.

### CRM

Open `/crm` to manage client conversations in the same authenticated Forge app. Each working
view has its own nested URL: `/crm/whatsapp`, `/crm/leads`, `/crm/pipeline`,
`/crm/follow-ups`, and `/crm/calls`. The CRM is light only and includes:

- Today, Leads, Pipeline, Follow ups, Calls, and WhatsApp views.
- Clear owner, stage, next action, and due date for every active opportunity.
- Fireflies call summaries and transcript links in the client record.
- A focused client dialog with separate Overview, WhatsApp, and Activity sections. It opens to the section that matches the current view.
- A suggested WhatsApp follow-up that can be copied and recorded as sent.
- A WhatsApp confirmation and reminder workflow with consent, scheduling, opt out, reschedule, pause, attendance, and human handoff states.
- An activity trail for owner, stage, next-action, meeting, and outbound-message changes.

The WhatsApp workflow queue is implemented. A WhatsApp Business provider is not configured yet, so Forge does not claim queued messages were delivered.

The API sync reads meetings directly from Fireflies GraphQL using `FIREFLIES_API_KEY`.
The initial backfill importer can also read `../clients/client-database.csv`. Both paths
are idempotent, so an existing transcript is updated instead of duplicated.

---

## Deploy on Railway

Railway's current docs support deploying a Next.js app from GitHub, wiring a Postgres service through `DATABASE_URL`, and configuring a separate cron service for scheduled tasks. This repo is set up for that flow.

### 1. Web service

- Create a new Railway project from this GitHub repo.
- Add a **PostgreSQL** service in the same project.
- Add a reference variable for `DATABASE_URL` from the Postgres service to the web service.
- Set these variables on the web service:
  - `DATABASE_SSL=disable` for Railway private-network Postgres
  - `DASHBOARD_PASSWORD`
  - `AUTH_SECRET`
  - `SYNC_SECRET`
  - `API_CLIENTS_JSON`
  - `GA4_PROPERTY_ID`
  - `GA4_HOSTNAME`
  - `GOOGLE_APPLICATION_CREDENTIALS_JSON`
  - `META_ACCESS_TOKEN`
  - `META_AD_ACCOUNT_ID`
  - `META_GRAPH_VERSION`
- Set the healthcheck path to `/api/health`.

The repo includes a base `railway.toml` for the **web service**. Current Railway settings are:

Railway should auto-detect or inherit:

- build command: `npm run build`
- start command: `npm run start`
- pre-deploy command: `npm run db:migrate`
- healthcheck: `/api/health`
- `HOSTNAME=0.0.0.0`

The production start script runs Next's standalone server artifact (`node .next/standalone/server.js`), which matches this repo's `output: 'standalone'` build configuration.

### 2. Database schema

Run the schema once before first use:

```bash
npm run db:migrate
```

If you want this automated on deploy, set Railway's **Pre-deploy Command** for the web service to:

```bash
npm run db:migrate
```

### 3. Sync cron service

Create a second Railway service from the same repo and set these in the Railway service settings:

- start command: `npm run sync -- 8`
- cron schedule: your preferred UTC schedule

Recommended daily schedule for **07:00 IST**:

```text
30 1 * * *
```

The sync process is designed to exit after completion so Railway can run it as a proper cron job.

CLI tasks (`npm run sync`, `npm run db:migrate`) now load `.env` only when the file exists. On Railway they use the service's injected environment variables directly, so the same commands work in both local and hosted environments.

### 4. Manual refresh security

The dashboard's **Sync data** button calls `/api/sync`. That route accepts either:

- a logged-in dashboard session, or
- `SYNC_SECRET` via `x-sync-secret` / `Authorization: Bearer ...`

Machine clients should use an identified `API_CLIENTS_JSON` credential with the `analytics:sync` scope. `SYNC_SECRET` remains as a legacy fallback during migration.

## Agent and machine API

`GET /api/v1/analytics` is the canonical path for agents and trusted integrations to read dashboard data. It uses the same query layer as the UI and always targets the server configured `META_AD_ACCOUNT_ID`. Callers cannot select a different Meta account.

Required headers:

```text
x-pillexis-client-id: codex
Authorization: Bearer <client-secret>
```

Optional query parameters are `from` and `to` in `YYYY-MM-DD` format, plus `campaign` using a campaign ID returned in `data.campaigns`. The default is 30 days across all campaigns and the maximum is 366 days. Any other query parameter is rejected.

Clients are configured in `API_CLIENTS_JSON` as an array with unique IDs, secrets, and scopes. Supported scopes are `analytics:read` and `analytics:sync`. Reads are recorded in `api_request_log` with client ID, route, status, and range; secrets are never logged. Give every external integration its own client so it can be audited and revoked independently.

The local Codex credential is stored outside Git at `../keys/analytics-api-clients.json`. Agents must use that credential and the Railway URL rather than reading the local database or calling Meta directly.

There are three supported sync paths, all hitting the same code path:
- **Daily**, Railway `forge-sync` cron service.
- **Manual UI**, the **Sync data** button calls `POST /api/sync`.
- **Manual terminal**, `npm run sync` or `npm run sync -- 30` for diagnostics and backfills.

The retired local launchd definitions are archived at `../archive/launchd/`. Do not reload them.

---

## Operating it

```bash
cd forge

npm run sync            # manual sync, last 8 days
npm run sync -- 30      # backfill 30 days
npm run db:migrate      # apply pending db/migrations/*.sql to the current DATABASE_URL
npm run db:migrate -- --dry-run   # list what would run, change nothing
npm run crm:import      # import ../clients/client-database.csv into the CRM
npm run crm:sync-fireflies -- 90  # sync the last 90 days through the Fireflies API
npm run build           # verify a production build

# watch logs (structured JSON, one line per event)
tail -f logs/sync.log
tail -f logs/server.log

```

---

## Observability

Nothing fails silently:
- **Structured logs** → `logs/sync.log`, `logs/server.log` (ISO timestamp + level per line).
- **`sync_runs` table** → one row per run (trigger, status `ok`/`partial`/`error`, duration, errors).
- **Sync view** in the UI → the run history with expandable error detail; the sidebar shows an amber/red dot when the last run wasn't clean.
- **No-clobber rule** → if a source (GA or Meta) fails on a run, the previous good data is **preserved**, the run is flagged `partial`, and the error is logged — it is never overwritten with zeros.

---

## Data model

| Table | Grain | Feeds |
|-------|-------|-------|
| `daily_summary` | one row per day | KPI cards, funnel, trend, deltas |
| `meta_ads_daily` | one row per ad per day | Ads view |
| `ga_sources_daily` | one row per source/medium per day (incl. `book_call_clicks`, `leads`) | Traffic view + per-source conversions |
| `ga_campaigns_daily` | one row per GA session campaign per day | Campaign-filtered funnel and KPIs |
| `ga_campaign_sources_daily` | one row per campaign/source/medium/day | Campaign-filtered traffic view |
| `sync_runs` | one row per sync run | Sync view + status strip |
| `api_request_log` | one row per machine API request | client audit and access review |
| `crm_companies` | one row per client company | client identity and billing details |
| `crm_contacts` | one row per person | contact details |
| `crm_deals` | one row per sales opportunity | owner, stage, next action |
| `crm_activities` | one row per interaction or change | client timeline |
| `crm_tasks` | one row per follow-up task | due work |
| `crm_meetings` | one row per Fireflies transcript | call context |
| `crm_bookings` | one row per Cal.com booking | meeting status and qualification |

Full DDL in [`db/migrations/`](db/migrations/). Every schema change is a new
numbered file applied exactly once and recorded in `schema_migrations`; applied
migrations are immutable, so a change to a shipped file fails the run.

---

## Configuration (`.env`)

| Var | Notes |
|-----|-------|
| `DATABASE_URL` | `postgres://postgres:pillexis@localhost:5433/pillexis_analytics` (local Docker) |
| `DATABASE_SSL` | `disable` for local Postgres |
| `DASHBOARD_PASSWORD` | dashboard login |
| `AUTH_SECRET` | signs the login cookie (`openssl rand -hex 32`) |
| `SYNC_SECRET` | protects `/api/sync` for cron/manual automation |
| `API_CLIENTS_JSON` | identified machine clients with `analytics:read` and/or `analytics:sync` scopes |
| `GA4_PROPERTY_ID` | numeric property ID `543367139` (not the `G-…` measurement ID) |
| `GA4_HOSTNAME` | website hostname included in the funnel, defaults to `pillexislabs.com` |
| `GOOGLE_APPLICATION_CREDENTIALS` | local path to `../keys/credentials/pillexislabs-ga4-service-account.json` |
| `GOOGLE_APPLICATION_CREDENTIALS_JSON` | one-line GA service-account JSON |
| `META_ACCESS_TOKEN` | long-lived System User token, scope `ads_read` |
| `META_AD_ACCOUNT_ID` | `act_1705074640527431` |

---

## Re-provisioning from scratch

If setting this up on a fresh machine:

1. **Postgres** — `docker run -d --name pillexis-analytics-pg --restart unless-stopped -p 5433:5432 -e POSTGRES_PASSWORD=pillexis -e POSTGRES_DB=pillexis_analytics -v pillexis_pg_data:/var/lib/postgresql/data postgres:16`.
2. Apply the schema with `npm run db:migrate`.
3. **GA4** — service account with the Analytics Data API enabled, added as a **Viewer** on the GA4 property; paste the JSON into `GOOGLE_APPLICATION_CREDENTIALS_JSON`.
4. **Meta** — a **System User** with the ad account assigned and a Business app installed, token scope `ads_read`, expiration **Never**.
5. `cp .env.example .env`, fill it, `npm install`, and use local commands only for development or diagnostics. Scheduled operation belongs on Railway.

---

## Troubleshooting

- **Meta `Schedule` reads 0.** Meta returns conversions under several alias `action_type`s; `src/modules/analytics/meta.ts` reads the canonical pixel types (`offsite_conversion.fb_pixel_schedule` / `_initiate_checkout`) to avoid double-counting. If your pixel uses a different event name, log the raw `actions` array and adjust.
- **GA returns nothing / one day only.** Confirm the service account is a Viewer and `GA4_PROPERTY_ID` is numeric. Note: as of this writing GA only reports site traffic from 2026-06-26 — see `PROGRESS.md` (likely the GA tag's install date, or ads pointing to WhatsApp not the site).
- **Cron syncs are skipped on Railway.** Railway cron services must exit cleanly after the task finishes. Use `npm run sync -- 8` as the cron start command, not `npm run start`.
- **Refresh writes zeros.** Check the service env. `/api/sync` needs the same secrets as the main app, especially the Meta token and `DATABASE_URL`.
- **Dashboard shows "not ready".** DB unreachable or schema not applied — check the Docker container and run `npm run db:migrate`.

---

## Repository layout

- `src/`, Next.js UI, authentication, database access, insights, and source integrations.
- `public/`, PWA icons and the network-only service worker.
- `db/`, Postgres schema.
- `scripts/`, CLI, migration, standalone-build, and retired local wrapper scripts.
- `plans/`, product planning artifacts. `plans/ROADMAP.md` is canonical; the session state and visual analytics plan provide supporting context.
- `output/` and `.playwright-cli/`, generated verification artifacts, ignored by Git.

Do not create new root-level folders for screenshots, temporary exports, or one-off notes. Durable new folders must be added to `AGENTS.md`, `CLAUDE.md`, and this README in the same change.
