# Progress & Changelog

Running log of what's built, what's known-broken, and what's next.
_Last updated: 2026-07-30._

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
- Shared ProductLogz-style workspace sidebar for Marketing analytics and CRM, with contextual view navigation inside the same shell.
- Date range (7/30/90 + custom), URL-encoded.
- Light-only interface across the dashboard, login, setup, and CRM.
- Mobile redesign: compact top navigation, scrollable view tabs, 2 by 2 KPI grid, compact sync state, collapsed custom dates, and stacked Ads and Traffic cards.
- Desktop header redesign: compact status and date summary, clear presets, and custom fields shown only on demand.
- Installable mobile PWA with Forge favicon, iOS home-screen icon, standalone metadata, and network-only service worker.

**Observability**
- Structured JSON logging → `logs/*.log`.
- `sync_runs` audit table + in-UI **Sync** view (status, trigger, duration, expandable errors) + sidebar status dot.
- No-clobber rule: a failed source preserves prior data instead of zeroing it; run flagged `partial`.

**Recent additions**
- Added real nested URLs for every CRM view and kept them visually nested below CRM in the desktop sidebar. The client record now uses a native modal dialog with focused Overview, WhatsApp, and Activity sections instead of one long form. WhatsApp rows open directly to WhatsApp, Calls opens to Activity, and other views open to Overview.
- Added a reusable ProductLogz-style core UI system for panels, headers, buttons, fields, badges, avatars, alerts, and dialogs. The CRM now consumes these shared components across desktop and mobile.
- Configured the local CRM data for end-to-end WhatsApp testing. Twenty two non-opted-out leads have test phone numbers, granted consent, and future call times. Ajay remains the explicit opted-out fixture so the stop branch stays testable.
- Split every CRM navigation item into a purpose-built view. Today is an urgency queue with health gaps, Pipeline groups populated deals by stage with a complete stage summary, Follow ups is grouped by due state, Leads remains the searchable master list, Calls remains the Fireflies view, and WhatsApp is the automation execution queue.
- Reworked `/crm` around the ProductLogz Users table pattern. Leads now includes every imported deal, including Qualified records, Calls is a dedicated view instead of a permanent side panel, the sidebar context is labelled CRM, and the desktop and mobile layouts use the shared Forge shell.
- Added the WhatsApp workflow queue. Each lead can store phone, consent, and call time, then move through confirmation, reminder, reschedule, pause, attendance, opt out, and human handoff states. Transitions are audited in CRM activity. Local schema migration and desktop plus 390 pixel browser verification passed. Provider delivery remains pending.
- Kept the WhatsApp operating screen focused on its actionable lead queue. The underlying booking, reply, reminder, exception, and stop rules remain documented in the CRM PRD rather than appearing as front-facing app content.
- Added the first Forge sales CRM release at `/crm`. It has Today, Pipeline, Follow ups, Leads, Calls, and WhatsApp views, explicit founder ownership, stages, next actions, Fireflies meeting context, follow up drafting, and an activity trail. The schema, direct Fireflies GraphQL sync, and idempotent CSV backfill importer are included.
- Added product-grade campaign filtering. Sync retains every Meta and GA campaign, `All campaigns` is the default, and users can select a campaign without changing deployment configuration. Hostname filtering keeps Cal.com and unrelated domains out of website metrics. The funnel now shows engaged sessions between sessions and booking intent.
- Period-over-period **delta badges** on KPIs (vs previous equal-length range).
- **Per-source conversions** — `ga_sources_daily` now captures `book_call_clicks` + `leads`; Traffic view shows conv. rate per source.
- Fixed Meta double-counting — read canonical pixel `action_type`s instead of substring-summing aliases.

**First actioned insight (2026-07-03)**
- The worst-ad rule flagged **Ad 01 · CRM Export · 1x1** ("₹3,473 spent, 0 bookings, 2.1% CTR. Consider shifting its budget to a better performer") and Anurag removed the ad from the campaign the same day. First time a dashboard insight directly drove a campaign change — the loop the product exists for. Removal recorded in `../docs/marketing/META_ADS_LAUNCH.md` and `../facebook-ads/README.md`.

## Known issues / watch items

1. **Staging provider isolation is Priority 0.** Staging must move to fixture-only data and lose all production Meta and GA credentials. Requirements and acceptance criteria are in `plans/ROADMAP.md`.
2. **Production Railway still needs `GOOGLE_APPLICATION_CREDENTIALS_JSON` on `forge` and `forge-sync`.** Deferred for later. Staging must not receive this credential.
3. **No log rotation** — local diagnostic `logs/*.log` grow unbounded if local commands are used repeatedly.

## Backlog (PM-prioritized)

- **Spend-anomaly alert** — MEDIUM. New `insights.ts` rule: "spend today ₹X vs 7-day avg ₹Y (±Z%)". Low effort.
- **Campaign-level rollup in Ads** — MEDIUM. Group ads under campaign totals before per-ad rows. Data already present.
- **Active view in the URL** (`?view=ads`) — nice-to-have, makes views bookmarkable / survive refresh.
- **Bookings trendline on the chart** — LOW, deferred until bookings are a regular occurrence.
