# Progress & Changelog

Running log of what's built, what's known-broken, and what's next.
_Last updated: 2026-06-27._

## Current state

Live and fully automated on Anurag's Mac:
- Local Postgres (Docker, port 5433) · always-on dashboard at `http://localhost:3000` · daily 07:00 sync — all via Docker `--restart` + two launchd agents.
- GA4 + Meta Ads both flowing. Data persists in the `pillexis_pg_data` Docker volume.

## Built so far

**Core pipeline**
- Next.js 14 app, Postgres store, `/api/sync` endpoint (GA4 Data API + Meta Marketing API).
- Idempotent sync — upsert by date, re-pulls last 3 days each run so late attribution settles.
- Password-gated dashboard (HMAC-signed cookie, Edge middleware).

**Local deployment & automation**
- Postgres in Docker (5433; 5432 was taken by another project).
- `com.pillexis.analytics.server` (always-on `next start`) + `com.pillexis.analytics.sync` (daily 07:00) launchd agents. Wrappers pin Node's path and `source .env`.

**Analysis layer**
- `src/lib/insights.ts` — rule-based "What's happening" findings with severity + a "→ Do" action (spend-with-no-conversions, biggest funnel leak, best/worst ad, CTR health, click→session drop, range trend).
- Conversion funnel with the worst-leaking stage highlighted.
- KPI cards: Cost per booked call, Session→booking rate, Ad spend, Book-call intent.

**Dashboard UX**
- Sidebar nav (`Analyze`: Overview/Funnel/Ads/Traffic · `System`: Sync), per IA decision from the PM copilot.
- Date range (7/30/90 + custom), URL-encoded.
- Light/dark theme toggle (persisted, no flash).

**Observability**
- Structured JSON logging → `logs/*.log`.
- `sync_runs` audit table + in-UI **Sync** view (status, trigger, duration, expandable errors) + sidebar status dot.
- No-clobber rule: a failed source preserves prior data instead of zeroing it; run flagged `partial`.

**Recent additions**
- Period-over-period **delta badges** on KPIs (vs previous equal-length range).
- **Per-source conversions** — `ga_sources_daily` now captures `book_call_clicks` + `leads`; Traffic view shows conv. rate per source.
- Fixed Meta double-counting — read canonical pixel `action_type`s instead of substring-summing aliases.

**First actioned insight (2026-07-03)**
- The worst-ad rule flagged **Ad 01 · CRM Export · 1x1** ("₹3,473 spent, 0 bookings, 2.1% CTR. Consider shifting its budget to a better performer") and Anurag removed the ad from the campaign the same day. First time a dashboard insight directly drove a campaign change — the loop the product exists for. Removal recorded in `META_ADS_LAUNCH.md` and `facebook-ads/README.md`.

## Known issues / watch items

1. **GA reports site traffic for only one day (2026-06-26).** Every prior day is 0 sessions, despite the ad campaign running since 2026-06-22. Likely the GA tag's effective install date, or ads pointing to **WhatsApp** (not the site) so the website gets little traffic. **Action: verify GA4 is firing on the live site.** This is the root cause of thin data and why period-over-period deltas don't display yet (no prior period to compare).
2. **Cal.com Meta Pixel not configured.** Bookings completed on the cal.com hosted page won't fire `Schedule`, so ad-attributed bookings undercount. Add Pixel `1548597113625938` in Cal.com.
3. **0 bookings so far** across spend — funnel leaks entirely at the booking step (22 book-call clicks → 0 bookings in the live window). Real, not a bug.
4. **launchd Node path is pinned** to the current nvm version in the wrapper scripts — update if Node is upgraded.
5. **No log rotation** — `logs/*.log` grow unbounded (trivial at current volume).

## Backlog (PM-prioritized)

- **Spend-anomaly alert** — MEDIUM. New `insights.ts` rule: "spend today ₹X vs 7-day avg ₹Y (±Z%)". Low effort.
- **Campaign-level rollup in Ads** — MEDIUM. Group ads under campaign totals before per-ad rows. Data already present.
- **Active view in the URL** (`?view=ads`) — nice-to-have, makes views bookmarkable / survive refresh.
- **Bookings trendline on the chart** — LOW, deferred until bookings are a regular occurrence.
