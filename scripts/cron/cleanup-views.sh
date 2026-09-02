#!/bin/bash
# Cron: nightly cleanup of View table
# - Keep last 90 days of page views (more than enough for trending/analytics)
# - Run nightly at 3 AM UTC via Vercel Cron or similar

set -e
cd /workspace/edutunisie

# Load env
set -a
source .env.local
set +a

echo "[$(date)] Starting View cleanup..."

# Step 1: Count rows to delete
COUNT=$(node -e "
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
(async () => {
  const r = await p.\$queryRaw\`SELECT count(*) as c FROM \"View\" WHERE \"createdAt\" < NOW() - INTERVAL '90 days'\`;
  console.log(r[0].c);
  await p.\$disconnect();
})();
")
echo "  Rows older than 90 days: $COUNT"

# Step 2: Delete
if [ "$COUNT" -gt 0 ]; then
  node -e "
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
(async () => {
  const t = Date.now();
  const r = await p.\$executeRaw\`DELETE FROM \"View\" WHERE \"createdAt\" < NOW() - INTERVAL '90 days'\`;
  console.log('  Deleted', r, 'rows in', (Date.now() - t), 'ms');
  await p.\$disconnect();
})();
"
fi

echo "[$(date)] View cleanup complete."
