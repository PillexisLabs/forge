# Forge roadmap

Canonical implementation roadmap for Forge marketing analytics.

**Last updated:** 2026-08-07

> **Platform note (2026-08-20):** Forge is now the module platform. The
> platform build order lives in `plans/PLATFORM.md` section 10 and takes
> precedence for structural work. This file remains the analytics-era
> roadmap; its Priority 0 staging-fixtures rule still applies.

## Execution order

Priority 0 continues unchanged and in parallel. The four items below were added on 2026-08-07
after reviewing the Fireflies sales corpus, Cal bookings, and Meta performance together. The
reasoning behind each is recorded in its own section.

| Order | Item | Why now |
|---|---|---|
| 1 | [Production WhatsApp sender](#a-production-whatsapp-sender) | Gates the live sales demo. Currently blocked on the Meta test number. |
| 2 | [Trigger abstraction and inbound lead capture](#b-trigger-abstraction-and-inbound-lead-capture) | The built workflow starts at a Cal booking. Most prospects have no booking, they have an ad click landing in WhatsApp. |
| 3 | [Demo scope in production](#c-demo-scope-in-production) | Gives sales a stable demo surface without loading staging with sales duty. |
| 4 | [Deal amount and source attribution](#d-deal-amount-and-source-attribution) | Forge measures cost per booked call. Bookings are not the bottleneck, closed deals are. |
| 5 | Priority 0, then Priority 1, then Priority 2 | Unchanged. |

**Evidence these four rest on, as of 2026-08-07:** 52 Cal bookings, 34 Meta Schedules,
₹45,094 spend, and **one closed deal at ₹30,000** (Propbotics, recorded in
`../clients/DEALS.md`). WhatsApp is raised by the prospect in 10 of 17 transcribed accounts.
Six accounts describe the same shape: paid ad, click to WhatsApp, nobody answers well.

---

## A. Production WhatsApp sender

Full account state, verified blockers, verification commands and the demand evidence behind
this work are in [`WHATSAPP_PRODUCTION_SETUP.md`](WHATSAPP_PRODUCTION_SETUP.md). Keep that
file current as blockers clear.

### Objective

Move WhatsApp delivery off the Meta test number so the workflow can be demonstrated live to a
prospect during a sales call, and so real leads can be enrolled.

### Why this is first

The most convincing demo of this product is not a dashboard. It is asking a prospect to message
a number and watch themselves get greeted, qualified and booked inside the thread they are
already looking at. That is impossible on the Meta test number, which only delivers to a small
set of pre-registered recipients. Every other demo option is a weaker substitute.

### Requirements

1. Register and verify a production WhatsApp Business number that is not a founder's personal
   number.
2. Submit and get approval for the templates the workflow already sends: booking confirmation,
   silence nudge, 24 hour reminder, attendance check, reschedule offer.
3. Keep template bodies identical to the copy already implemented, so approval does not silently
   change what the code sends.
4. Store the production phone number id and token as production-only variables. Staging must
   never receive them, per Priority 0.
5. Keep the existing consent gate, opt-out latch, duplicate protection, and provider audit
   untouched. A production number widens reach, it does not relax any rule.
6. Document the 24 hour customer service window constraint and which messages must therefore be
   templates rather than free-form.

### Acceptance criteria

- A lead with consent and a real phone number receives the full sequence on the production
  number, with Meta message ids recorded in the activity trail.
- An inbound reply on the production number is signature verified, classified, and moves the
  workflow state.
- An opted-out number receives nothing, on any transition.
- Staging has no production WhatsApp credential and cannot send.

---

## B. Trigger abstraction and inbound lead capture

### Objective

Let the workflow start from an inbound WhatsApp message from an unknown sender, not only from a
Cal.com booking.

### Why

The implemented flow begins at *"a lead books a Pillexis call through Cal.com."* That is the
Pillexis funnel. It is not the prospect funnel. Six accounts in the corpus described the same
different entry point, in their own words:

- Sneak In: *"we run Instagram meta ads with a click to action button and the chat is redirected to our WhatsApp business"*
- Aarav Singh, Whistleclap: *"We want to fix better WhatsApp message automations for the leads we are getting"*
- SuperReply: *"leads come to the coaches' WhatsApp and Instagram, currently a human replies to that lead"*
- SS EduTech: *"WhatsApp lead nurturing is something I have been looking at for a while but sort of not had the bandwidth"*
- Jitsy, Propbotics: the same ad to WhatsApp path

These are not two products. They are one pipeline with two entry points. Capture, identify,
qualify, book, confirm, remind, recover, follow up, hand off. The Cal booking is an adapter that
enters at the booking step with capture already done. Everything downstream is shared.

### Implementation scope

1. Introduce an explicit trigger layer. Initial triggers: `CalBookingCreated` and
   `InboundWhatsAppUnknown`. Both must produce the same lead and workflow state shape.
2. On an inbound message from a number with no matching lead, create a lead, record the source,
   and enter the qualification state. Never assume identity.
3. Add the capture and booking stages the Cal path currently skips: qualify, offer times, create
   the booking, then join the existing confirmation sequence.
4. Keep the existing rule that an unconfident identity match goes to human review rather than
   guessing, and never reveal booking details to an unmatched sender.
5. Record the originating trigger on the lead so reporting can separate the two paths.

### Acceptance criteria

- A message from an unknown number with no Cal booking produces a lead, a qualification
  exchange, a booking, and the existing confirmation and reminder sequence, with no manual CRM
  entry.
- The Cal.com path behaves exactly as before, with no regression.
- Both paths share one state machine. A downstream fix applies to both without duplication.
- The trigger is visible on the lead record and in the activity trail.

### Follow-on experiment, not a blocker

Once this ships, point one Pillexis ad set at click to WhatsApp instead of Cal.com. 68% of all
Schedules to date came from WhatsApp-message ads, so this is worth testing on its own merits, and
it makes Pillexis run the same flow its prospects need. Dogfooding and experiment in one change.

---

## C. Demo scope in production

### Objective

Give sales a stable, always-working demo surface, without turning staging into a sales asset.

### Why not staging

Staging follows the `staging` branch, which is the active development branch, so a demo shown
from staging is whatever was pushed that morning, possibly mid-migration. Priority 0 is also
deliberately making staging fixture-only and credential-free. Giving staging sales duty creates
standing pressure to reintroduce real data for a demo, which is exactly what Priority 0 forbids.
A demo surface must never be broken, and a staging environment exists so that things are allowed
to break. Those requirements cannot both live on one system.

### What already exists

`scripts/seed-crm-demo.ts` seeds 15 fictional D2C leads covering every workflow state, tags every
row (`crm_deals.lead_source = 'demo'`, contacts and companies `notes = 'demo-fixture'`), only ever
deletes its own tagged rows, and uses `now()`-relative timestamps so appointments always look
current. The CRM already has an All / Live / Demo scope toggle. This item finishes that work
rather than starting it.

### Requirements

1. Run the demo seed against production deliberately. Keep the existing non-localhost guard and
   use `--allow-remote` consciously, do not weaken the guard.
2. **Exclude demo rows from every analytics, KPI, funnel, insight, and revenue aggregate.** This
   is the load-bearing requirement. Without it, fixture deals silently inflate real reporting.
3. Make the demo scope visually unmistakable on screen, so a demo record can never be mistaken
   for a real client during a call or in a screenshot.
4. Demo leads must never be enrolled into real WhatsApp sending unless their numbers are
   explicitly founder-owned test numbers.
5. Re-seeding must stay idempotent and must never touch a real imported deal.

### Acceptance criteria

- Demo and live records coexist in production, and no aggregate anywhere includes demo rows.
- Toggling scope changes only what is displayed, never what is counted.
- A re-seed leaves every real deal, contact, company, task, and activity untouched.
- Nobody viewing a shared screen can mistake a demo lead for a real client.

---

## D. Deal amount and source attribution

### Objective

Let Forge answer what a closed deal cost and which ad produced it.

### Why

Forge's headline metric is cost per booked call. The evidence says the booked call is not the
bottleneck: 52 bookings produced one closed deal. `crm_deals` carries stages through
`discovery_won` and `won` but has **no amount column**, and nothing joins a closed deal back to
the ad spend that created it. Pillexis's first revenue, ₹30,000 from Propbotics, arrived from a
Meta ad and is currently unattributable, which is why `../clients/DEALS.md` had to be created by
hand. The current backlog entry *"Bookings trendline, deferred until bookings are a regular
occurrence"* has it backwards. Bookings are regular. Deals are not.

### Implementation scope

1. Add `amount_agreed` and `amount_received` to `crm_deals`, kept separate. Agreed is not
   collected.
2. Add acquisition source fields to the deal: channel, campaign, and where known the specific ad.
3. Populate source from the trigger layer in item B where the path is automated, and allow manual
   entry where it is not.
4. Add a query-layer join from won deals to `meta_ads_daily` so spend and revenue can be reported
   on one range.
5. Add two KPIs: **cost per closed deal** and **revenue by source ad**. Keep cost per booked call,
   it is still a useful upstream indicator, but it is no longer the headline.
6. Add an `insights.ts` rule for an ad that produces bookings but no closed deals, which is a
   different and more expensive failure than an ad producing no bookings.

### Acceptance criteria

- A won deal records agreed and received amounts independently.
- Cost per closed deal is computed from real data for any selected range, with an explicit empty
  state rather than a misleading zero when no deal closed in that range.
- Revenue attributes to a source ad wherever the trigger captured one.
- Demo rows are excluded, per item C.
- `../clients/DEALS.md` can be reconciled against Forge, and the intent is that Forge eventually
  replaces it.

---

## Sales CRM release

The focused two-founder CRM described in [`CRM_PRD.md`](CRM_PRD.md) is implemented in
the Forge app at `/crm`. The first release covers the shared client database, ownership,
pipeline stage, next actions, Fireflies meeting context, manual WhatsApp follow-up
recording, the WhatsApp workflow queue, and the client activity trail.

### Next automation task: Booking confirmation through post-call follow-up

Build one complete Pillexis workflow around the existing CRM and WhatsApp queue. The
goal is to remove repetitive booking coordination while keeping sales conversations
and sensitive messages under founder control.

#### Customer flow

1. A lead books a Pillexis call through Cal.com and clicks **Confirm your booking on WhatsApp**.
2. Forge matches the WhatsApp sender to the Cal.com booking using normalized phone or
   email. If no confident match exists, it asks for the booking email and creates a
   human-review task instead of guessing.
3. Forge confirms the date and time, then asks one qualification question with the
   initial choices Operations automation, AI stack audit, or Product development.
4. The answer updates the CRM lead, interest, pipeline stage, owner, and next action.
5. Forge sends configurable reminders, initially 24 hours and 1 hour before the call,
   with a reschedule path. A free-form reply pauses automation and hands the full
   conversation to a founder.
6. After the call, Fireflies supplies the meeting summary. Forge updates the CRM,
   creates promised tasks, and drafts a contextual WhatsApp follow-up.
7. The founder reviews and approves the post-call message before Forge sends it. If the
   meeting was missed, Forge offers one reschedule message instead.

#### Implementation scope

1. Add idempotent Cal.com booking ingestion and deal matching.
2. Connect the existing inbound WhatsApp webhook to booking identification and the
   qualification state.
3. Persist qualification answers, reminder state, handoff state, and message outcomes
   in the CRM activity trail.
4. Add the post-call Fireflies processor for CRM updates, promised tasks, and follow-up
   drafting.
5. Add an approval queue for generated post-call messages. Negotiation, complaints,
   scope changes, and uncertain identity matches remain manual.
6. Reuse the existing consent, opt-out, duplicate protection, provider audit, and
   workflow stop rules.

#### Acceptance criteria

- A synthetic lead can move from Cal.com booking to WhatsApp confirmation,
  qualification, reminders, Fireflies processing, and an approved follow-up without
  manual CRM data entry.
- An unmatched sender never receives booking details and is routed to human review.
- Any free-form reply, opt-out, complaint, or commercial question pauses automation.
- Every automated decision, message, approval, task, and CRM change is visible in the
  client activity trail.
- The workflow runs with fixtures in staging and never requires production customer
  data or production provider credentials there.

Remaining integration work:

1. Schedule the implemented Fireflies API ingestion in production.
2. Complete the booking confirmation through post-call follow-up automation above.
3. Move WhatsApp delivery from the Meta test number to an approved production number
   and templates after staging verification.

## Priority 0: Isolate staging from production data

### Objective

Staging must never read from or write to production analytics systems. It must use its own Postgres database and deterministic dummy data. Production remains the only environment allowed to contact the live Pillexis Meta and GA accounts.

### Current state

- Railway staging and production already use separate Postgres databases and private networks.
- Staging currently contains eight days previously synced from Meta account `act_1705074640527431`. This historical staging data may remain.
- Staging currently has access to the same live Meta account as production, so infrastructure isolation is incomplete at the upstream data source.
- The staging `forge-sync` service is scheduled. It must stop contacting live providers before the next scheduled run.
- GA service account JSON is not configured on Railway in either environment.

### Required architecture

| Environment | Data mode | Database | Scheduled sync | External credentials |
|---|---|---|---|---|
| Staging | `fixture` | Staging Postgres | Fixture refresh only, or disabled | None for Meta or GA |
| Production | `live` | Production Postgres | Daily live sync | Production scoped Meta and GA credentials |

### Requirements

1. Remove `META_ACCESS_TOKEN`, `META_AD_ACCOUNT_ID`, `GOOGLE_APPLICATION_CREDENTIALS`, and `GOOGLE_APPLICATION_CREDENTIALS_JSON` from both staging services.
2. Disable the staging live cron. If a scheduled staging job remains, its only permitted command is the fixture seed command.
3. Add `DATA_SOURCE_MODE=fixture` to staging and `DATA_SOURCE_MODE=live` to production.
4. Add `LIVE_SYNC_ENABLED=true` only to production.
5. Make all Meta and GA sync entry points fail closed unless both conditions are true:
   - `RAILWAY_ENVIRONMENT_NAME=production`
   - `LIVE_SYNC_ENABLED=true`
6. Add `npm run db:seed:staging` to create deterministic dummy daily summaries, ads, traffic sources, and sync history.
7. Fixture generation must be idempotent and must never require a network request or production credential.
8. Show a visible `Demo data` label throughout staging so screenshots and decisions cannot be mistaken for production analytics.
9. Give staging and production separate API clients and secrets. A client must not work across environments.
10. Codex must use the production API for real advertising analysis and the staging API only for UI and integration testing.
11. Keep Meta and GA secrets scoped to individual production services. Do not use Railway shared variables for live provider credentials.
12. Add automated tests proving staging rejects live sync even if a production credential is accidentally injected.

### Implementation order

#### Phase 0: Immediate containment

- Remove live provider variables from staging `forge` and `forge-sync`.
- Disable the staging cron schedule or replace its command with a no-network fixture command.
- Confirm the production variables and cron remain unchanged.

#### Phase 1: Code guardrails

- Centralize environment and data-mode checks in `src/core/env.ts`.
- Guard `runSync`, `/api/sync`, and the CLI before provider clients are constructed.
- Return a clear `live_sync_disabled` error in non-production environments.
- Record denied sync attempts without logging credentials.

#### Phase 2: Fixture data

- Add deterministic fixture definitions under `db/fixtures/` or `scripts/fixtures/`.
- Add an idempotent staging seed command.
- Cover at least 90 days, multiple campaigns, winning and losing ads, zero-conversion spend, partial syncs, and funnel leaks.
- Use obviously synthetic names such as `Demo Campaign` and `Fixture Ad 01`.

#### Phase 3: Environment identification

- Add an environment indicator to the dashboard shell.
- Show `Demo data` in staging and never show it in production.
- Include the environment and data mode in the health response without exposing secrets.

#### Phase 4: Agent and API routing

Status on 2026-08-06: the scoped API is live in production, a separate read-only `codex` client is configured in Railway, and the local keys file contains distinct staging and production entries. An authenticated production request returned HTTP 200. Staging isolation and explicit cross-environment rejection checks remain open under Priority 0.

- Promote the scoped analytics API to production after staging verification.
- Create a separate read-only Codex client for production.
- Store staging and production client credentials as separate entries in `../keys/analytics-api-clients.json`.
- Make operational guidance direct real ad questions to production only.

#### Phase 5: Verification

- Confirm staging and production `DATABASE_URL` fingerprints differ.
- Confirm staging has no Meta or GA credential variables.
- Confirm a staging live sync attempt fails before any network request.
- Confirm fixture seeding changes only staging Postgres.
- Confirm production sync still reads the configured production Meta account.
- Confirm production API credentials fail against staging and staging credentials fail against production.

### Acceptance criteria

- Staging can run indefinitely without possessing or contacting any production Meta or GA credential.
- Staging cannot trigger live sync through the UI, API, CLI, or Railway cron.
- Staging remains useful for dashboard, mobile, PWA, API, date range, and failure-state testing.
- Production data and workflows are unchanged by staging deployments, fixture refreshes, and schema migrations.
- Codex uses production for real analytics questions and clearly identifies fixture responses when testing staging.

### Allowed future alternatives

- A separate Meta test ad account with its own system user, token, pixel, campaigns, and no production assets.
- A one-way sanitized production snapshot pipeline that removes IDs, names, and sensitive fields before staging import.
- Railway PR environments seeded only with fixtures.

None of these alternatives may restore production Meta or GA credentials to staging.

## Priority 1: Complete Railway GA integration

- Configure valid `GOOGLE_APPLICATION_CREDENTIALS_JSON` on production `forge` and `forge-sync` only.
- Verify GA sessions, source attribution, and booking events through production sync.
- Keep GA credentials absent from staging and represent GA rows through fixtures.

## Priority 2: Product analytics foundation

Forge must treat accounts, campaigns, date ranges, and traffic segments as data dimensions, not deployment configuration.

1. Keep `All campaigns` as the default dashboard scope.
2. Persist campaign identity during sync and apply campaign filters at query time.
3. Keep hostname as a connection-level setting because it defines which website belongs to the workspace.
4. Store provider identifiers alongside display names. Never use a campaign name as the sole identity.
5. Preserve filters in the URL so analysis is shareable and reproducible.
6. Return available filters and the active filter through the machine API.
7. Next, introduce `workspaces`, `connections`, and `workspace_members` before onboarding a second customer. Provider credentials must belong to a connection, not global environment variables.
8. Add a campaign-mapping layer for GA UTM values that do not equal the provider campaign ID or name.
9. Build landing-page, device, placement, and geography filters on the same query-time dimension model.
10. Keep raw provider facts immutable. Derived insights and recommendations should be recomputable when attribution rules change.

## Product roadmap context

The detailed intelligent analytics and Ad Ops Copilot proposal remains in `intelligent-analytics-plan.html`, with session decisions in `SESSION_STATE.md`. Those files provide product direction; this file is the canonical ordered implementation roadmap.
