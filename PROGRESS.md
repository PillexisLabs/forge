# Progress & Changelog

Running log of what's built, what's known-broken, and what's next.
_Last updated: 2026-08-20._

## Current state

- Railway production is live at `https://forge-production-fc70.up.railway.app` from `master`.
- Railway staging is live at `https://forge-staging-7d05.up.railway.app` from `staging` and is the default environment for ongoing work.
- Each environment has isolated `forge`, `forge-sync`, and Postgres services. The web service runs schema migration before deploy and uses `/api/health`; the sync service runs daily at 07:00 IST.
- The local analytics server and sync launchd jobs are retired. Their disabled definitions are archived under `../archive/launchd/`; Railway is the only scheduled runtime.
- Staging has eight days of Meta data for `act_1705074640527431`; authenticated API reads return that data. GA remains deferred until valid service-account JSON is configured.
- Production data was backfilled through 2026-07-19 and the dashboard reports the selected range independently from the number of days containing data.
- Production has a dedicated `codex` machine client with `analytics:read` scope. The matching secret is stored only in `../keys/analytics-api-clients.json`, alongside the separate staging client. A live production request returned HTTP 200 on 2026-08-06.

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
- `src/modules/analytics/insights.ts` — rule-based "What's happening" findings with severity + a "→ Do" action (spend-with-no-conversions, biggest funnel leak, best/worst ad, CTR health, click→session drop, range trend).
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
- WhatsApp automation now sends for real. A Cloud API provider module and a queue worker (`npm run crm:whatsapp-worker`, `--watch` for continuous mode) drain `next_message_at`: confirmation, one silence nudge, the 24 hour reminder, and the 2 hour attendance check, all audited with Meta message ids. An inbound webhook (`/api/whatsapp/webhook`, signature verified) records replies on the lead, classifies confirm / reschedule / stop keywords (free form escalates to a founder), moves the state, and sends an acknowledgement. Consent is enforced on every transition that enables sending, opt out is a one way latch, and closing a deal won or lost stops its queue. Currently on the Meta test number; production needs a real number plus approved templates.
- Deterministic demo fixtures: `npm run crm:seed-demo` seeds 15 fictional D2C leads covering every workflow state with time-relative dates, refuses non-localhost databases without `--allow-remote`, and only ever deletes its own tagged rows. An All / Live / Demo scope toggle on the CRM keeps demo and real leads separate on screen.
- Workspace UX overhaul: the sidebar and topbar moved into a persistent root-layout chrome (no more remount flicker), navigation is grouped under collapsible Analytics / CRM sections in the ProductLogz style with mask-tinted icons, every CRM view has its own page header, analytics views are deep linkable via `?view=`, the sync status dot degrades when data is stale, tables scroll inside their panel with sticky headers, and dialogs lock background scroll.
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

## Added 2026-08-07

Four items were added to the top of `plans/ROADMAP.md` after reviewing the Fireflies sales
corpus, Cal bookings, and Meta performance together: production WhatsApp sender, trigger
abstraction for inbound leads, demo scope in production, and deal amount plus source
attribution. See the Execution order table there.

The finding driving them: **52 Cal bookings and 34 Meta Schedules have produced one closed deal
at ₹30,000.** Forge currently measures cost per booked call and has no revenue field, so the
first paying customer is unattributable. WhatsApp is raised by the prospect in 10 of 17
transcribed accounts, and six describe the same entry point the built workflow does not yet
support: a paid ad click landing directly in WhatsApp with no booking object.

## Platform era — 2026-08-20

Forge became the delivery platform. The contract is `plans/PLATFORM.md`;
the team explainer is `plans/forge-platform-architecture.html`. The repo
moved to the `PillexisLabs` GitHub organization on 2026-08-18.

**Shipped today (all on `staging`):**

- **PR 1 — the carve** (merged). `src/lib/` is gone: shared code moved to
  `src/core/`, capability code to `src/modules/{analytics,whatsapp,crm}/`.
  An ESLint boundary rule makes any module-to-module import (and any
  core-to-module import) a build error. `crm-types.ts` went to core, not
  crm — it holds shared deal, stage, and WhatsApp workflow types.
  - Fix-up commit `6dc96be`: the PR 1 commit staged only `src/`, so the
    import rewrites in `scripts/` and `tests/` were missed. Local builds
    passed on the working tree while the Railway build failed. Lesson:
    after a repo-wide refactor, verify the committed tree
    (`git grep 'src/lib' HEAD`), not the working tree.
- **PR 2 — the event spine** (merged). `events` outbox + `event_cursors`
  tables (already applied to the staging database), `src/core/events.ts`
  with `emitEvent()` / `consumeEvents()` (at-least-once, per-consumer
  cursor under a row lock). Live emitters: `booking.created` (Cal intake,
  same transaction), `lead.replied` (inbound WhatsApp), `sync.completed`
  (analytics sync). First consumer: the whatsapp worker consumes
  `booking.created` and starts the confirmation workflow — the last
  cross-module import is gone. Behavior note: the confirmation now starts
  on the next worker pass (up to ~1 minute) instead of inside the webhook.
- **PR 3 — manifests** (open: PillexisLabs/forge#3). One `manifest.ts` per
  module (name, version, nav, events in/out, config keys);
  `src/modules/registry.ts` is the composition root; the sidebar and
  mobile nav build from the registry. Rendered nav unchanged.
- **Voice spike** (`spikes/voice-call/`, committed, excluded from the app
  build). One outbound AI call: Twilio Media Streams ↔ Sarvam STT → LLM →
  TTS in Hinglish. Prints per-turn latency PASS/FAIL against the 1.2 s
  budget and the transcript on hangup. Blocked on credentials only.

**Infrastructure note:** Railway had a platform incident today (Google
Cloud upstream) — deployments were paused/queued for hours. The deploy
triggers themselves are correctly configured post-transfer.

**Next steps, in order:**

1. Anurag: merge PR 3; create Twilio (voice number + ~USD 10 credit +
   India geo permission) and Sarvam (API key + ~INR 2k) accounts; put the
   five keys in `../keys/.env` per `spikes/voice-call/README.md`.
2. ~~Verify staging after the deploy goes green~~ — done 2026-08-20
   23:05 IST: deploy SUCCESS, app Ready, deploy-time migration applied
   the events tables, inline worker started, booking consumer created
   its cursor row, `/api/health` 200, login 200, authenticated
   analytics API 200 with data.
3. Run the voice spike; pass = under 1.2 s per turn.
4. Build `src/modules/voice/` on the event spine → sets the Milap demo
   date.
5. Then: lead-qual split, `/docs` route, demo workspace, Foundry
   (order in `plans/PLATFORM.md` section 10).
