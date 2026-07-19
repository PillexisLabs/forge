# AGENTS.md

Guidance for coding agents working in the Forge marketing analytics repository.

## Git repository boundary

This `forge/` directory is an independent Git repository. The parent Pillexis workspace is not a Git repository, and `../website/` is a separate repository. Run Git and GitHub commands from `forge/`, or use `git -C forge ...` from the workspace root. Never stage, commit, push, or open a pull request that mixes Forge and website changes.

**Hard GitHub account rule:** Every GitHub operation for Forge must use `anurag619`. The `anuragrk10` account belongs to a different organization and must never be used here. Before any `gh` mutation, verify the active account with `gh auth status`. If needed, run `gh auth switch -h github.com -u anurag619`. Never restore or switch to `anuragrk10` while working in this repository.

## Canonical ownership

This repository is the only active analytics implementation. The old local copy at `../archive/marketing-analytics-local/` is frozen and must not receive changes.

Read `README.md` for operation and deployment, `PROGRESS.md` for current status, and `plans/ROADMAP.md` for ordered implementation priorities. Roadmap Priority 0 requires staging to use fixtures and forbids production Meta or GA credentials in staging.

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

- `src/`, application and sync implementation.
- `public/`, PWA icons and service worker. Do not cache authenticated pages or API responses.
- `db/`, Postgres schema.
- `scripts/`, migration, sync, standalone-build, and retired local wrappers.
- `plans/`, product planning artifacts. `plans/ROADMAP.md` is the canonical ordered roadmap; older session and HTML plans are supporting context.
- `output/`, generated verification artifacts only.
- `.playwright-cli/`, generated browser state only.

Do not add credentials, screenshots, generated builds, or planning files to the repository root. Add new top-level folders only when they represent a durable code or operational boundary, then document them in this file, `CLAUDE.md`, and `README.md`.

## Verification

Before committing, run `git diff --check` and `npm run build`. For UI changes, verify authenticated desktop and 390px mobile flows with Playwright. Confirm `/api/health` returns 200 after Railway rollout.
