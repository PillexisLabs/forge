#!/bin/zsh
# Daily sync wrapper for launchd. PATH is pinned because launchd runs with a
# minimal environment (no nvm). Update the node path if you change Node version.
export PATH="/Users/zombiez/.nvm/versions/node/v22.12.0/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin"
cd /Users/zombiez/anurag/pillexis/forge || exit 1
echo "=== sync run: $(date) ==="
exec npm run sync -- 8
