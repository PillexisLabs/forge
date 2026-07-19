# AGENTS.md

Guidance for coding agents working in the Forge marketing analytics repository.

## Canonical ownership

This repository is the only active analytics implementation. The old local copy at `../archive/marketing-analytics-local/` is frozen and must not receive changes.

Read `README.md` for operation and deployment, and `PROGRESS.md` for current status and backlog.

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

## Local automation

The launchd jobs `com.pillexis.analytics.server` and `com.pillexis.analytics.sync` point to this repository's `scripts/` and `logs/` folders. Keep those paths canonical if files move.

## Repository organization

- `src/`, application and sync implementation.
- `db/`, Postgres schema.
- `scripts/`, migration, sync, standalone-build, and launchd wrappers.
- `plans/`, product planning artifacts.
- `output/`, generated verification artifacts only.
- `.playwright-cli/`, generated browser state only.

Do not add credentials, screenshots, generated builds, or planning files to the repository root. Add new top-level folders only when they represent a durable code or operational boundary, then document them in this file, `CLAUDE.md`, and `README.md`.

## Verification

Before committing, run `git diff --check` and `npm run build`. For UI changes, verify authenticated desktop and 390px mobile flows with Playwright. Confirm `/api/health` returns 200 after Railway rollout.
