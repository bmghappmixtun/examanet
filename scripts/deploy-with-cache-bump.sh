#!/bin/bash
# Auto-bump CF cache version before deploy to invalidate stale HTML
# (cached HTML references old chunk hashes that get deleted on each deploy,
# causing 404s on JS chunks → React hydration errors)

set -e

WORKER_FILE="worker-with-cache.js"

# Extract current version
CURRENT=$(grep -oE "https://cache\.v[0-9]+/" "$WORKER_FILE" | head -1 | grep -oE "v[0-9]+")
if [ -z "$CURRENT" ]; then
  echo "❌ Could not extract current cache version from $WORKER_FILE"
  exit 1
fi

# Strip 'v' prefix
NUM=${CURRENT#v}
NEW_NUM=$((NUM + 1))
NEW="v${NEW_NUM}"

echo "🔄 Bumping cache version: $CURRENT → $NEW"

# Replace in worker file
sed -i "s|https://cache\.${CURRENT}/|https://cache.${NEW}/|g" "$WORKER_FILE"
sed -i "s|'${CURRENT}-HIT'|'${NEW}-HIT'|g" "$WORKER_FILE"
sed -i "s|'${CURRENT}-MISS'|'${NEW}-MISS'|g" "$WORKER_FILE"
sed -i "s|'${CURRENT}-bypass'|'${NEW}-bypass'|g" "$WORKER_FILE"

# Verify
if grep -q "https://cache.${NEW}/" "$WORKER_FILE"; then
  echo "✅ Cache version bumped to $NEW"
else
  echo "❌ Bump failed"
  exit 1
fi
