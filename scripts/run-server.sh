#!/bin/zsh
# Always-on local dashboard server for launchd (keep-alive). Serves the production
# build at http://localhost:3000.
export PATH="/Users/zombiez/.nvm/versions/node/v22.12.0/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin"
export PORT=3000
cd /Users/zombiez/anurag/pillexis/forge || exit 1
# Load .env into the process environment so API routes (e.g. /api/sync) get the
# Meta token and DB creds — next start does not reliably inject .env at runtime.
set -a
[ -f .env ] && . ./.env
set +a
exec npm run start
