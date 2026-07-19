# CLAUDE.md

## Git repository boundary

This `forge/` directory is an independent Git repository. The parent Pillexis workspace is not a Git repository, and `../website/` is a separate repository. Run Git and GitHub commands from `forge/`, or use `git -C forge ...` from the workspace root. Never stage, commit, push, or open a pull request that mixes Forge and website changes.

**Hard GitHub account rule:** Every GitHub operation for Forge must use `anurag619`. The `anuragrk10` account belongs to a different organization and must never be used here. Before any `gh` mutation, verify the active account with `gh auth status`. If needed, run `gh auth switch -h github.com -u anurag619`. Never restore or switch to `anuragrk10` while working in this repository.

Follow `AGENTS.md` in this directory as the canonical project guidance. It defines ownership, branch and Railway deployment workflow, local automation, folder organization, and required verification.

For analytics questions, use the authenticated Railway `GET /api/v1/analytics` endpoint with the local client credential in `../keys/analytics-api-clients.json`. Do not query local Postgres, call Meta directly, or reload the archived launchd jobs.

Read `README.md` before operational changes and `PROGRESS.md` before feature work. Do not modify `../archive/marketing-analytics-local/`; all analytics work belongs in this repository.
