# Pillexis · Marketing Analytics

An internal dashboard that pulls **Google Analytics 4** and **Meta Ads** daily and joins
them on the one metric that matters: **cost per booked call** (the `Schedule` conversion).
It doesn't just chart numbers — a rule-based insights engine tells you *what's converting,
where the funnel leaks, and what to do next.*

```
Meta impressions → clicks → GA sessions → book-call clicks → Schedule (booking)
                                                                    │
                              North star:  Meta spend ÷ bookings  =  ₹ cost per booked call
```

Stack: **Next.js 14** (App Router) · **Postgres** · **Tremor** charts. Separate from the
public marketing site so ad-spend data and API secrets stay private.

> See [`PROGRESS.md`](PROGRESS.md) for the running changelog, known issues, and backlog.

---

## Deployment modes

This app supports two sane operating modes:

- **Railway** — recommended. Run the dashboard as a normal web service, attach a Railway Postgres service, and run sync as a separate Railway cron service.
- **Local** — optional. Keep the original Mac-based setup with Docker Postgres and launchd wrappers.

For hosting, treat this as **two services from one repo**:

1. **Web service** — serves the Next.js dashboard.
2. **Sync service** — runs `npm run sync -- 8` on a cron schedule and exits.

That split matches Railway's current model for cron jobs: scheduled services should run a task and terminate when finished.

---

## Features

**Sidebar navigation** (`Analyze` / `System` sections):

| View | What it answers |
|------|-----------------|
| **Overview** | Sync health + KPIs + "What's happening" insights + funnel + trend, in one screen |
| **Funnel** | Clicks → Sessions → Book-call clicks → Bookings, with the **biggest leak highlighted** |
| **Ads** | Per-ad Meta breakdown (spend, CTR, bookings, cost/booking) |
| **Traffic** | GA sources with **per-source conversions** (book-call clicks, bookings, conv. rate) |
| **Sync** | History of every sync run — status, trigger, duration, expandable errors |

**Analysis & UX:**
- **Insights engine** (`src/lib/insights.ts`) — prioritized plain-English findings (critical → warning → good → info), each with a "→ Do" action. Detects spend-with-no-conversions, the worst funnel leak, best/worst ads, CTR health, click→session drop-off, and range trends.
- **KPI cards** — Cost per booked call, Session→booking rate, Ad spend, Book-call intent — each with **period-over-period delta** badges (vs the previous equal-length range).
- **Date range** — Last 7 / 30 / 90 days + custom; everything (KPIs, funnel, tables, insights) recomputes for the range. State lives in the URL (`?from=&to=`).
- **Light / dark theme** toggle (persisted, no flash on load).

---

## Deploy on Railway

Railway's current docs support deploying a Next.js app from GitHub, wiring a Postgres service through `DATABASE_URL`, and configuring a separate cron service for scheduled tasks. This repo is set up for that flow.

### 1. Create the web service

- Create a new Railway project from this GitHub repo.
- Add a **PostgreSQL** service in the same project.
- Add a reference variable for `DATABASE_URL` from the Postgres service to the web service.
- Set these variables on the web service:
  - `DATABASE_SSL=require`
  - `DASHBOARD_PASSWORD`
  - `AUTH_SECRET`
  - `SYNC_SECRET`
  - `GA4_PROPERTY_ID`
  - `GOOGLE_APPLICATION_CREDENTIALS_JSON`
  - `META_ACCESS_TOKEN`
  - `META_AD_ACCOUNT_ID`
  - `META_GRAPH_VERSION`
- Set the healthcheck path to `/api/health`.

Railway should auto-detect:

- build command: `npm run build`
- start command: `npm run start`

### 2. Apply the schema

Run the schema once before first use:

```bash
npm run db:migrate
```

If you want this automated on deploy, set Railway's **Pre-deploy Command** for the web service to:

```bash
npm run db:migrate
```

### 3. Create the sync cron service

Create a second Railway service from the same repo and set:

- start command: `npm run sync -- 8`
- cron schedule: your preferred UTC schedule

Recommended daily schedule for **07:00 IST**:

```text
30 1 * * *
```

The sync process is designed to exit after completion so Railway can run it as a proper cron job.

### 4. Protect manual refresh

The dashboard's **Refresh now** button calls `/api/sync`. That route accepts either:

- a logged-in dashboard session, or
- `SYNC_SECRET` via `x-sync-secret` / `Authorization: Bearer ...`

That lets Railway-hosted cron, CI, or an external scheduler trigger syncs safely if needed.

---

## Local automation

Two **launchd** agents in `~/Library/LaunchAgents/`:

| Agent | Does | Wrapper |
|-------|------|---------|
| `com.pillexis.analytics.server` | Keeps the dashboard alive at :3000 (RunAtLoad + KeepAlive) | `scripts/run-server.sh` |
| `com.pillexis.analytics.sync` | Daily 07:00 sync | `scripts/run-sync.sh` |

Both wrappers pin Node's path (launchd has a minimal env) and `source .env` so the Meta
token and DB creds are present. Fetching is **idempotent** — every run upserts by date and
re-pulls the last 8 days so late ad attribution settles.

There are **three ways to fetch**, all hitting the same code path:
- **Daily** — the launchd sync job.
- **Manual (UI)** — the **Refresh now** button → `POST /api/sync`.
- **Manual (terminal)** — `npm run sync` (or `npm run sync -- 30` to backfill 30 days).

---

## Operating it

```bash
cd extracted-forge

npm run sync            # manual sync, last 8 days
npm run sync -- 30      # backfill 30 days
npm run db:migrate      # apply db/schema.sql to the current DATABASE_URL
npm run build           # rebuild after code changes (then restart the server agent)

# restart the always-on server after a rebuild
launchctl kickstart -k gui/$(id -u)/com.pillexis.analytics.server

# watch logs (structured JSON, one line per event)
tail -f logs/sync.log
tail -f logs/server.log

# inspect the DB
docker exec -it pillexis-analytics-pg psql -U postgres -d pillexis_analytics
```

- **Change the daily time** — edit `Hour`/`Minute` in `~/Library/LaunchAgents/com.pillexis.analytics.sync.plist`, then `launchctl kickstart -k …`.
- **Change the password** — edit `DASHBOARD_PASSWORD` in `.env`, then restart the server agent.

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
| `sync_runs` | one row per sync run | Sync view + status strip |

Full DDL in [`db/schema.sql`](db/schema.sql).

---

## Configuration (`.env`)

| Var | Notes |
|-----|-------|
| `DATABASE_URL` | `postgres://postgres:pillexis@localhost:5433/pillexis_analytics` (local Docker) |
| `DATABASE_SSL` | `disable` for local Postgres |
| `DASHBOARD_PASSWORD` | dashboard login |
| `AUTH_SECRET` | signs the login cookie (`openssl rand -hex 32`) |
| `SYNC_SECRET` | protects `/api/sync` for cron/manual automation |
| `GA4_PROPERTY_ID` | numeric property ID `543367139` (not the `G-…` measurement ID) |
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
5. `cp .env.example .env`, fill it, `npm install`, `npm run sync`, then load the two launchd agents.

---

## Troubleshooting

- **Meta `Schedule` reads 0.** Meta returns conversions under several alias `action_type`s; `src/lib/meta.ts` reads the canonical pixel types (`offsite_conversion.fb_pixel_schedule` / `_initiate_checkout`) to avoid double-counting. If your pixel uses a different event name, log the raw `actions` array and adjust.
- **GA returns nothing / one day only.** Confirm the service account is a Viewer and `GA4_PROPERTY_ID` is numeric. Note: as of this writing GA only reports site traffic from 2026-06-26 — see `PROGRESS.md` (likely the GA tag's install date, or ads pointing to WhatsApp not the site).
- **Cron syncs are skipped on Railway.** Railway cron services must exit cleanly after the task finishes. Use `npm run sync -- 8` as the cron start command, not `npm run start`.
- **Refresh writes zeros.** Check the service env. `/api/sync` needs the same secrets as the main app, especially the Meta token and `DATABASE_URL`.
- **Dashboard shows "not ready".** DB unreachable or schema not applied — check the Docker container and `db/schema.sql`.
