# Progress & Changelog

Running log of what's built, what's known-broken, and what's next.
_Last updated: 2026-07-19._

## Current state

- Railway production is live at `https://forge-production-fc70.up.railway.app` from `master`.
- Railway staging is live at `https://forge-staging-7d05.up.railway.app` from `staging` and is the default environment for ongoing work.
- Each environment has isolated `forge`, `forge-sync`, and Postgres services. The web service runs schema migration before deploy and uses `/api/health`; the sync service runs daily at 07:00 IST.
- The local analytics server and sync launchd jobs are retired. Their disabled definitions are archived under `../archive/launchd/`; Railway is the only scheduled runtime.
- Staging has eight days of Meta data for `act_1705074640527431`; authenticated API reads return that data. GA remains deferred until valid service-account JSON is configured.
- Production data was backfilled through 2026-07-19 and the dashboard reports the selected range independently from the number of days containing data.

## Built so far

**Core pipeline**
- Next.js 14 app, Postgres store, `/api/sync` endpoint (GA4 Data API + Meta Marketing API).
- Idempotent sync — upsert by date, re-pulls the last 8 days so late attribution settles.
- Password-gated dashboard (HMAC-signed cookie, Edge middleware).

**Machine access**
- Versioned `GET /api/v1/analytics` endpoint backed by the dashboard's shared query layer.
- Identified API clients with separate bearer secrets and `analytics:read` / `analytics:sync` scopes.
- Fixed server-side Meta account targeting and `api_request_log` access auditing.

**Analysis layer**
- `src/lib/insights.ts` — rule-based "What's happening" findings with severity + a "→ Do" action (spend-with-no-conversions, biggest funnel leak, best/worst ad, CTR health, click→session drop, range trend).
- Conversion funnel with the worst-leaking stage highlighted.
- KPI cards: Cost per booked call, Session→booking rate, Ad spend, Book-call intent.

**Dashboard UX**
- Sidebar nav (`Analyze`: Overview/Funnel/Ads/Traffic · `System`: Sync), per IA decision from the PM copilot.
- Date range (7/30/90 + custom), URL-encoded.
- Light/dark theme toggle (persisted, no flash).
- Mobile redesign: fixed bottom navigation, 2 by 2 KPI grid, compact sync state, collapsed custom dates, and stacked Ads and Traffic cards.
- Desktop header redesign: compact status and date summary, clear presets, and custom fields shown only on demand.

**Observability**
- Structured JSON logging → `logs/*.log`.
- `sync_runs` audit table + in-UI **Sync** view (status, trigger, duration, expandable errors) + sidebar status dot.
- No-clobber rule: a failed source preserves prior data instead of zeroing it; run flagged `partial`.

**Recent additions**
- Period-over-period **delta badges** on KPIs (vs previous equal-length range).
- **Per-source conversions** — `ga_sources_daily` now captures `book_call_clicks` + `leads`; Traffic view shows conv. rate per source.
- Fixed Meta double-counting — read canonical pixel `action_type`s instead of substring-summing aliases.

**First actioned insight (2026-07-03)**
- The worst-ad rule flagged **Ad 01 · CRM Export · 1x1** ("₹3,473 spent, 0 bookings, 2.1% CTR. Consider shifting its budget to a better performer") and Anurag removed the ad from the campaign the same day. First time a dashboard insight directly drove a campaign change — the loop the product exists for. Removal recorded in `../docs/marketing/META_ADS_LAUNCH.md` and `../facebook-ads/README.md`.

## Known issues / watch items

1. **Railway still needs `GOOGLE_APPLICATION_CREDENTIALS_JSON` on both `forge` and `forge-sync`.** Deferred for later. Local sync uses `../keys/credentials/pillexislabs-ga4-service-account.json`; Railway needs one-line JSON instead.
2. **No log rotation** — local diagnostic `logs/*.log` grow unbounded if local commands are used repeatedly.

## Backlog (PM-prioritized)

- **Spend-anomaly alert** — MEDIUM. New `insights.ts` rule: "spend today ₹X vs 7-day avg ₹Y (±Z%)". Low effort.
- **Campaign-level rollup in Ads** — MEDIUM. Group ads under campaign totals before per-ad rows. Data already present.
- **Active view in the URL** (`?view=ads`) — nice-to-have, makes views bookmarkable / survive refresh.
- **Bookings trendline on the chart** — LOW, deferred until bookings are a regular occurrence.
