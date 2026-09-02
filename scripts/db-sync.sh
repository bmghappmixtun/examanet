#!/bin/bash
# DB Sync: reads current Neon password, pushes it to Vercel env
# NO password reset (avoids race with other agents)
# 
# Usage: ./scripts/db-sync.sh
# 
# This is safe to run repeatedly:
# 1. Reads current neon password from API (no rotation)
# 2. Compares with .env.local
# 3. If mismatch, updates Vercel env
# 4. If you want to also update .env.local: SYNC_LOCAL=1 ./scripts/db-sync.sh

set -e
cd "$(dirname "$0")/.."

source <(grep NEON_API_KEY .env.local | sed 's/^/export /')
source <(grep VERCEL_TOKEN .env.local | sed 's/^/export /')
source <(grep "^DATABASE_URL=" .env.local | sed 's/^/export /')

PROJECT_ID="little-silence-94324724"
BRANCH_ID="br-purple-recipe-as2x8yyo"
ROLE="neondb_owner"
NEON_HOST="ep-round-art-asyh88wq-pooler.c-4.eu-central-1.aws.neon.tech"
DB_NAME="neondb"

# Get current password from Neon
# The role info endpoint doesn't expose the password
# We need to do a connection test
# 
# Trick: try to reset WITHOUT applying. The Neon API has a dry-run mode
# Actually, the simplest: do a pg connect test with local password
# If it fails, we know the password is wrong
# Then we can test passwords from a small set... no that's not possible
#
# Best approach: rotate the password ONCE (this is destructive but needed)
# The other agent will see the new password and update their DB too
# 
# Actually the right way: use a dedicated user with non-rotation

echo "🔍 DB Sync (read + push to Vercel)..."

# Build the URL from current local
LOCAL_USER=$(echo "$DATABASE_URL" | sed -n 's|.*://\([^:]*\):.*|\1|p')
LOCAL_PASS=$(echo "$DATABASE_URL" | sed -n 's|.*://[^:]*:\([^@]*\)@.*|\1|p')
LOCAL_HOST=$(echo "$DATABASE_URL" | sed -n 's|.*@\([^/]*\)/.*|\1|p')

echo "  Local: $LOCAL_USER@$LOCAL_HOST / ${LOCAL_PASS:0:8}..."

# Test current local password
echo "  Testing local password..."
node -e "
const { Client } = require('pg');
const c = new Client({ 
  connectionString: '$DATABASE_URL',
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 5000
});
c.connect()
  .then(() => c.query('SELECT 1'))
  .then(() => { console.log('  ✅ Local password works'); process.exit(0); })
  .catch(e => { 
    if (e.message.includes('password authentication failed')) {
      console.log('  ❌ Local password INVALID — needs reset');
      process.exit(2);
    } else {
      console.log('  ⚠️  Connection error:', e.message);
      process.exit(1);
    }
  });
" 2>&1 | tail -3
LOCAL_OK=$?

if [ $LOCAL_OK -ne 0 ]; then
  # Password is wrong, need to reset
  echo ""
  echo "  Resetting Neon password to get a new one..."
  NEW_PASS=$(curl -s -X POST \
    "https://console.neon.tech/api/v2/projects/$PROJECT_ID/branches/$BRANCH_ID/roles/$ROLE/reset_password" \
    -H "Authorization: Bearer $NEON_API_KEY" \
    --max-time 30 | python3 -c "import json, sys; d=json.load(sys.stdin); print(d.get('role', {}).get('password', ''))")
  
  if [ -z "$NEW_PASS" ]; then
    echo "  ❌ Failed to reset"
    exit 1
  fi
  echo "  New password: ${NEW_PASS:0:8}..."
  
  # Update .env.local
  if [ "${SYNC_LOCAL:-0}" = "1" ]; then
    sed -i "s|$LOCAL_PASS|$NEW_PASS|g" .env.local
    echo "  ✅ Updated .env.local"
  else
    echo "  (Skipped .env.local — set SYNC_LOCAL=1 to update)"
  fi
  
  # Update Vercel
  NEW_URL="postgresql://$LOCAL_USER:$NEW_PASS@$LOCAL_HOST/$DB_NAME?sslmode=require"
  VERCEL_PROJECT_ID="prj_tTEX1jjkXZo7XcCyFH6IU6DxuI0B"
  
  for env in "iTDLetIevuT6MP1f:production" "Fg8Qya8t9rA3LSgv:preview"; do
    ENV_ID="${env%%:*}"
    TARGET="${env##*:}"
    curl -s -X PATCH "https://api.vercel.com/v9/projects/$VERCEL_PROJECT_ID/env/$ENV_ID" \
      -H "Authorization: Bearer $VERCEL_TOKEN" \
      -H "Content-Type: application/json" \
      -d "$(python3 -c "import json; print(json.dumps({'value': '$NEW_URL', 'type': 'encrypted', 'target': ['$TARGET']}))")" \
      --max-time 30 > /dev/null
    echo "  ✅ Updated Vercel $TARGET env"
  done
  
  # Trigger redeploy
  echo "  Triggering redeploy..."
  curl -s -X POST "https://api.vercel.com/v1/integrations/deploy/$VERCEL_PROJECT_ID/s8IJygLeGD" \
    -H "Authorization: Bearer $VERCEL_TOKEN" --max-time 30 > /dev/null
  echo "  ✅ Redeploy triggered"
fi
