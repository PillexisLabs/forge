# Progress & Changelog

Running log of what's built, what's known-broken, and what's next.
_Last updated: 2026-08-21._

## Current state

- Railway production is live at `https://forge.pillexislabs.com` from `master` (Railway fallback URL: `forge-production-fc70.up.railway.app`).
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

**Next steps, in order:** superseded by the 2026-08-21 list below.
(Done from the old list: staging verified 2026-08-20 23:05 IST — deploy
SUCCESS, events tables migrated, inline worker started, booking consumer
cursor created, health/login/analytics all 200.)

## Added 2026-08-21

**CRM and analytics UI fixes** (commit `39e7f85`, deployed to staging,
build SUCCESS):

- Every tall list and table now scrolls inside its own panel instead of
  the page: Today queue, follow-up groups, pipeline columns, ads and
  traffic tables (sticky headers), sync log. Mobile keeps page scroll.
- The table toolbar groups the stage filter and search on the right; the
  left side is reserved for future bulk-select actions.
- Removed the "N leads, M calls recorded" header line (same numbers on
  every view, read as placeholder data) and the Pipeline health panel on
  Today (it repeated the four stat chips).
- Fixed the stat chips not recomputing on the All/Live/Demo scope toggle.

**Two new plans** (commit `3cf05a6`):

- `plans/RBAC.md` — roles and permissions, **top priority** by decision
  on 2026-08-20. Today any valid session grants everything. Plan: three
  roles (admin/member/viewer) + per-user module allowlist + permission
  strings checked at the route. Two PRs; lands after PR 3, before the
  voice module. Also added to the `PLATFORM.md` checklist as item 4.
- `plans/CRM_BACKFILL.md` — replay the Cal.com bookings into the
  **production** CRM and attach Fireflies summaries. Verified via both
  APIs on 2026-08-20: 78 intro-call bookings (74 unique emails, 66 past
  accepted, 8+ upcoming, 37 in July and 37 in August — the pipeline is
  active), 50 with a matched Fireflies recording, **zero bookings carry
  a phone number** (the WhatsApp form field is still missing). Both CRM
  databases are empty of real leads today.
- Standing rule recorded with the backfill plan: **staging never
  receives real data values.** Fixtures only; data-writing scripts must
  refuse non-production targets.

**Open PRs:** #3 (manifests) and #4 — an external contribution from
`asliashutosh` adding a migration runner, opened 2026-08-20. Both need
Anurag's review.

**Merged later the same day:** PR 3 (manifests, after a conflict resolution
merge of staging into the branch) and PR 4 (the migration runner). The
setup notice was repointed from the removed `db/schema.sql` to
`npm run db:migrate`.

**RBAC PR A built** (branch `platform/rbac-pr-a`, per `plans/RBAC.md`
section 9): the `users` table migration (`0002`), bcryptjs, session tokens
carrying `uid.session_version.issued_at` with a 30-day expiry, email +
password login with a 5-per-15-minutes rate limit, first-login admin
seeding from `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`, and CRM/sync
routes that resolve the acting user and write real names into the activity
trail. One plan amendment: the Edge middleware stays stateless (it cannot
reach Postgres); `getSessionUser()` in the Node layer is the boundary and
rejects deleted, disabled, and revoked sessions. Verified end to end
locally: seed login, wrong password 401, revocation via `session_version`
bump 401, disabled user 401, sixth login attempt 429, migration adoption
on a populated database. `DASHBOARD_PASSWORD` dies at this cutover —
Railway needs the two seed vars before the deploy.

**RBAC PR B built** (branch `platform/rbac-pr-b`, stacked on PR A):
`hasPermission()` + `requirePermission()` in core, guards on every
mutating route (crm:write, whatsapp:write, whatsapp:send for send-now,
analytics:sync for the manual sync trigger), `permissions` field on every
module manifest, page-level read guards with an access notice, nav
filtered by role and module allowlist (Settings appears for admins only),
a Settings → Users screen (create, edit role and modules, disable,
reset password), self-service password change with current-password
proof, lockout protection (no self-demote or self-disable), and viewer
read-only state on the CRM drawer and the sync button. Verified by a
scripted sweep: viewer 403 on all six mutating/admin routes, a member
scoped to `[crm, whatsapp]` writes CRM but gets 403 on sync and the
access notice on analytics, password change revokes old sessions. One
bug found and fixed during verification: postgres.js returns bigserial
ids as strings, which silently broke the `self.id === id` identity
checks — ids are now cast to int in `src/core/users.ts`. Sign-in is
restricted to `@pillexislabs.com` addresses (`AUTH_EMAIL_DOMAIN`,
fail-closed default; a client copy sets its own domain, `*` disables) —
enforced at login, user creation, and admin seeding.

**Voice module scaffolded** (branch `platform/voice-module`, stacked on
PR B): `src/modules/voice/` on the event spine per `plans/PLATFORM.md`
section 8. The manifest declares `permissions: ['call']`, consumes
`lead.qualified`, emits `call.completed` and `followup.requested`.
Migration `0003` adds `vc_calls` (one row per attempt, deduped on the
triggering event id). Pure rules in `voice-rules.ts`: consent gate
(WhatsApp consent only, opt-out honored) and the 10:00–19:00 IST calling
window. Providers sit behind a telephony interface: a Twilio REST
adapter (dials into the media-stream bridge once the spike passes) and a
stub for dry runs. `npm run voice:worker` consumes events, queues
eligible calls, dials due ones, writes the outcome to the CRM activity
trail, and emits `call.completed` transactionally. Verified end to end
in dry-run against the local database: consented lead called and
completed, opted-out lead skipped with reason, second pass fully
idempotent. The realtime audio bridge stays in `spikes/voice-call/`
until its 1.2 s/turn latency test passes with real keys.

**Staging verified after the RBAC + voice merges (2026-08-21 evening):**
PRs 3, 4, 5, 6, and 7 are merged; deploy `5e67c81` SUCCESS. The deploy
log shows `0003_voice_calls.sql` applied (0001/0002 were adopted by the
earlier PR 5 deploy). Live checks: health 200, anonymous request
redirects to /login, off-domain login 401, the seeded
`anurag@pillexislabs.com` admin logged in (200), Settings → Users
renders the admin row, and the analytics dashboard renders. The
consumed `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` vars were removed
from Railway staging; `DASHBOARD_PASSWORD` is deleted. Production still
runs the old shared password until this reaches `master` — set the two
seed vars on the production `forge` service before promoting.

**Voice spike ran live (2026-08-21 night):** five real calls on the
Twilio + Sarvam stack after Twilio's Trust Hub profile was approved
(voice ships disabled until then — error 10005). Sarvam had deprecated
all three models since the spike was written; the new defaults are
`saarika:v2.5`, `sarvam-105b-conversations`, and `bulbul:v3` (speaker
`priya` — v3 has its own roster). Verdict: **conversation quality is
demo-grade** — the best call held nine coherent Hinglish turns,
confirmed a meeting time, and answered "what does Pillexis do" — but
**turn latency FAILS the 1.2 s budget: 1.7–3.9 s** (stt 0.3–0.9 s +
llm 0.9–1.9 s + tts-first 0.4–1.5 s, all sequential REST). Fixes that
landed in the spike: Devanagari-only replies (romanized Hindi through
the hi-IN voice is what sounded garbled), phonetic brand spellings
(व्हाट्सऐप), greeting pre-synthesized during the ring, VAD threshold
350 (700 missed real speech) with a live mic-level log, per-stage
latency instrumentation, sentence-split parallel TTS. Passing the
budget requires the streaming build (streaming STT + streamed LLM
first-sentence into TTS) — that is the `src/modules/voice/` bridge
work, not more spike tuning.

**Next steps, in order:**

1. Anurag: add the WhatsApp number field to the Cal booking form;
   register the Cal → Forge production webhook (commands in
   `plans/WHATSAPP_PRODUCTION_SETUP.md`); create the Twilio and Sarvam
   accounts and put the keys in `../keys/.env` per
   `spikes/voice-call/README.md`; create Priyanka's account in
   Settings → Users on staging.
2. Build and run the CRM backfill script against production
   (`plans/CRM_BACKFILL.md`), then hand-set the judgment stages.
3. Run the voice spike; pass = under 1.2 s per turn.
4. Wire the media-stream bridge from the passing spike into
   `src/modules/voice/` (`recordCallResult()` is the seam) → sets the
   Milap demo date.
5. Then: lead-qual split, `/docs` route, demo workspace, Foundry
   (order in `plans/PLATFORM.md` section 10).
