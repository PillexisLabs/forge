# Forge roadmap

Canonical implementation roadmap for Forge marketing analytics.

**Last updated:** 2026-07-30

## Sales CRM release

The focused two-founder CRM described in [`CRM_PRD.md`](CRM_PRD.md) is implemented in
the Forge app at `/crm`. The first release covers the shared client database, ownership,
pipeline stage, next actions, Fireflies meeting context, manual WhatsApp follow-up
recording, the WhatsApp workflow queue, and the client activity trail.

Remaining integration work:

1. Schedule the implemented Fireflies API ingestion in production.
2. Add Cal.com booking ingestion and deal matching.
3. Connect a controlled WhatsApp provider to the implemented queue.
4. Add deterministic CRM fixtures before testing the interface on staging.

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

- Centralize environment and data-mode checks in `src/lib/env.ts`.
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
