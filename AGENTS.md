# AGENTS.md

Guidance for coding agents working in the Forge repository (Pillexis's Exo-style delivery platform of reusable modules).

## Git repository boundary

This `forge/` directory is an independent Git repository. The parent Pillexis workspace is not a Git repository, and `../website/` is a separate repository. Run Git and GitHub commands from `forge/`, or use `git -C forge ...` from the workspace root. Never stage, commit, push, or open a pull request that mixes Forge and website changes.

**Hard GitHub account rule:** Every GitHub operation for Forge must use `anurag619`. The `anuragrk10` account belongs to a different organization and must never be used here. Before any `gh` mutation, verify the active account with `gh auth status`. If needed, run `gh auth switch -h github.com -u anurag619`. Never restore or switch to `anuragrk10` while working in this repository.

## Canonical ownership

Forge is Pillexis's Exo-style delivery platform of reusable modules (WhatsApp automation, lead qualification + CRM sync, analytics/insights, AI voice calling). It serves as the internal delivery backbone and environment for live sales demos, not a SaaS. The IP model: the client owns their instance (modules are templates copied into the client's GitHub repo), and Pillexis keeps upstream templates.

The Analytics dashboard is the first module, and this repository is the only active analytics implementation. The old local copy at `../archive/marketing-analytics-local/` is frozen and must not receive changes.

Read `README.md` for operation and deployment, `PROGRESS.md` for current status, and `plans/PLATFORM.md` for the platform contract and the ordered build checklist (section 10). Review every PR against `plans/PLATFORM.md`. The older `plans/ROADMAP.md` holds the analytics-era priorities; its Priority 0 rule still applies: staging uses fixtures and must not hold production Meta or GA credentials.

## Platform structure (mandatory since 2026-08-20)

The code is carved into core and modules. These rules are enforced by an ESLint boundary rule — breaking them fails the build:

- `src/core/` — auth, config, db, logging, the event bus (`events.ts`), shared data-spine types (`crm-types.ts`), the manifest type. Core must not import from `src/modules/`.
- `src/modules/<name>/` — analytics, whatsapp, crm (voice next). A module must not import another module. Modules communicate only through events (`emitEvent` / `consumeEvents` from `@/core/events`) and the shared database tables.
- `src/modules/registry.ts` — the composition root, the only file that imports every module's `manifest.ts`. App-level code that needs "all modules" (the nav, future status pages, the Foundry) reads this registry.
- Each module has a `manifest.ts`: name, version, nav entries, events emitted and consumed, env keys read. Update the manifest whenever any of those change.
- New code placement: shared by two or more modules → core; glue for one outside service → a provider adapter inside the module; client-specific → the client's repo, never upstream; otherwise → the owning module (full decision list in `plans/PLATFORM.md` section 6).
- `spikes/` — throwaway experiments, excluded from the app build via `tsconfig.json`. Never import from `spikes/` in app code.
- After any repo-wide refactor, verify the committed tree, not the working tree: `git grep '<old path>' HEAD`. The carve shipped broken once because `scripts/` rewrites were left unstaged while the local build passed.

## Branch and deployment workflow

- Develop and push ongoing work on `staging`.
- Railway staging URL: `https://forge-staging-7d05.up.railway.app`.
- Railway staging services `forge` and `forge-sync` auto-deploy from `staging`.
- Railway production URL: `https://forge-production-fc70.up.railway.app`.
- Railway production services auto-deploy from `master`.
- Promote tested work by merging `staging` into `master`. Do not push unverified feature work directly to `master`.
- Both environments have separate Postgres services. Never assume staging data is production data.

## Railway service model

- `forge`, Next.js web service, `npm run start`, pre-deploy `npm run db:migrate`, healthcheck `/api/health`, `HOSTNAME=0.0.0.0`.
- `forge-sync`, cron service, `npm run sync -- 8`, schedule `30 1 * * *` UTC, equivalent to 07:00 IST.
- Both app services use `DATABASE_URL=${{Postgres.DATABASE_URL}}` and `DATABASE_SSL=disable`.
- `GOOGLE_APPLICATION_CREDENTIALS_JSON` remains a deferred Railway credential. Local sync uses the file referenced by `.env`.

## Analytics API

- Agents and integrations must read analytics through Railway `GET /api/v1/analytics`, not local Postgres or direct Meta calls.
- Authenticate with the client ID and bearer secret stored outside Git in `../keys/analytics-api-clients.json`.
- API clients have explicit `analytics:read` and `analytics:sync` scopes. Never reuse one client across unrelated integrations.
- The server configured `META_AD_ACCOUNT_ID` is authoritative. Never add an API parameter that lets callers select an arbitrary Meta account.
- Local launchd analytics jobs are retired. Their disabled definitions are in `../archive/launchd/` and must not be reloaded.

## Repository organization

- `src/core/`, shared foundation (auth, db, env, events, logging, manifest type).
- `src/modules/`, one folder per module plus `registry.ts` (see Platform structure above).
- `src/app/` and `src/components/`, Next.js routes and UI shells.
- `public/`, PWA icons and service worker. Do not cache authenticated pages or API responses.
- `db/`, Postgres schema as ordered migrations in `db/migrations/`, applied by `npm run db:migrate`. Every schema change is a new `NNNN_lower_snake_case.sql` file, applied exactly once and recorded in `schema_migrations`. Never edit a migration that has already been applied — add a new one.
- `scripts/`, migration, sync, standalone-build, and retired local wrappers.
- `plans/`, product planning artifacts. `plans/PLATFORM.md` is the platform contract and build order; `plans/forge-platform-architecture.html` is the team explainer; `plans/ROADMAP.md` is the analytics-era roadmap kept for context.
- `spikes/`, throwaway experiments (currently `voice-call/`), excluded from the app build.
- `output/`, generated verification artifacts only.
- `.playwright-cli/`, generated browser state only.

Do not add credentials, screenshots, generated builds, or planning files to the repository root. Add new top-level folders only when they represent a durable code or operational boundary, then document them in this file, `CLAUDE.md`, and `README.md`.

## The Hermes rule (theme)

Forge's canonical theme is **Slate Sky** (adopted 2026-08-01, palette drawn from a sky-blue AirPods Max on Hermes-style woven leather). Every Forge surface follows it:

- All colors come from `src/styles/tokens.css` variables. Never hardcode hex/oklch values in components or `globals.css`; add a token instead.
- Anchor palette: slate blue accent `#4e7397` (strong `#35566f`, soft `#e8f0f7`), navy-slate ink `#1b2531`, cool blue-grey paper `#f3f5f8`, sky `#a9c6dc` for chart fills/gradients and selected states.
- `--color-leather` (`#8a6f5b`) is a rare warm support accent (Demo badges, occasional callouts). Never use it for primary UI.
- Semantic colors (positive/warning/critical/info) mark state only, never decoration.
- Do not reintroduce the retired violet or Pillexis-red accents anywhere in Forge, including brand icons (`public/forge-logo.png`, `public/icons/*`, `src/app/apple-icon.png`, `src/app/favicon.ico` are slate).
- Light theme only, no dark mode or theme toggles (Pillexis-wide rule).
- Mobile (≤900px) always keeps the **fixed bottom navigation** (`.forge-bottom-nav` in `WorkspaceChrome`); the sidebar is desktop-only. Do not remove the bottom nav in redesigns.

## Verification

Before committing, run `git diff --check` and `npm run build`. For UI changes, verify authenticated desktop and 390px mobile flows with Playwright. Confirm `/api/health` returns 200 after Railway rollout.
