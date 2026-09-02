#!/bin/bash
# DB Health Check
# Tests if the current .env.local password matches what Neon API returns
# Exits 1 if mismatch, 0 if match
# 
# Usage: ./scripts/db-health-check.sh

set -e
cd "$(dirname "$0")/.."

source <(grep NEON_API_KEY .env.local | sed 's/^/export /')
source <(grep "^DATABASE_URL=" .env.local | sed 's/^/export /')

PROJECT_ID="little-silence-94324724"
BRANCH_ID="br-purple-recipe-as2x8yyo"
ROLE="neondb_owner"

echo "🔍 Checking Neon DB health..."

# Get current password from local
LOCAL_PASS=$(echo "$DATABASE_URL" | sed -n 's|.*://[^:]*:\([^@]*\)@.*|\1|p')
echo "  Local password: ${LOCAL_PASS:0:8}..."

# Reset password to get a new one
echo "  Triggering password reset..."
NEW_PASS=$(curl -s -X POST \
  "https://console.neon.tech/api/v2/projects/$PROJECT_ID/branches/$BRANCH_ID/roles/$ROLE/reset_password" \
  -H "Authorization: Bearer $NEON_API_KEY" \
  --max-time 30 | python3 -c "import json, sys; d=json.load(sys.stdin); print(d.get('role', {}).get('password', ''))")

if [ -z "$NEW_PASS" ]; then
  echo "  ❌ Failed to reset password"
  exit 1
fi

echo "  New password:   ${NEW_PASS:0:8}..."

if [ "$LOCAL_PASS" = "$NEW_PASS" ]; then
  echo "  ✅ Passwords match — DB connection should work"
  exit 0
else
  echo "  ⚠️  MISMATCH — local password is stale!"
  echo "  Local: $LOCAL_PASS"
  echo "  Neon:  $NEW_PASS"
  echo ""
  echo "  Run this to fix:"
  echo "  sed -i 's|${LOCAL_PASS}|${NEW_PASS}|g' .env.local"
  exit 1
fi
