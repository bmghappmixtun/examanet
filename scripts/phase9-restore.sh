#!/bin/bash
# Phase 9 RESTORE — re-activate Neon + Vercel
#
# Usage:
#   VERCEL_TOKEN=xxx NEON_API_KEY=yyy bash scripts/phase9-restore.sh
#   (Vercel upgrade is dashboard-only)

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

if [ -z "$VERCEL_TOKEN" ] || [ -z "$NEON_API_KEY" ]; then
  echo -e "${RED}❌ VERCEL_TOKEN and NEON_API_KEY must be set${NC}"
  exit 1
fi

# NEON — Resume
echo "════════════════════════════════════════════════════════"
echo "NEON — Resume"
echo "════════════════════════════════════════════════════════"
NEON_PROJECTS=$(curl -sS -H "Authorization: Bearer $NEON_API_KEY" "https://console.neon.tech/api/v2/projects")
NEON_PROJECT_ID=$(echo "$NEON_PROJECTS" | python3 -c "
import json, sys
d = json.load(sys.stdin)
for p in d.get('projects', []):
    if 'examanet' in (p.get('name','') + p.get('id','')).lower():
        print(p['id'])
        break
")

if [ -z "$NEON_PROJECT_ID" ]; then
  echo -n "Enter Neon project ID: "
  read NEON_PROJECT_ID
fi

NEON_ENDPOINTS=$(curl -sS -H "Authorization: Bearer $NEON_API_KEY" "https://console.neon.tech/api/v2/projects/$NEON_PROJECT_ID/endpoints")
NEON_ENDPOINT_ID=$(echo "$NEON_ENDPOINTS" | python3 -c "
import json, sys
d = json.load(sys.stdin)
for e in d.get('endpoints', []):
    if e.get('type') == 'read_write':
        print(e['id'])
        break
")

if [ -z "$NEON_ENDPOINT_ID" ]; then
  echo -e "${RED}❌ No read_write endpoint found${NC}"
  exit 1
fi

echo "  Resuming endpoint $NEON_ENDPOINT_ID to 0.25-0.25 CU..."
curl -sS -X PATCH \
  -H "Authorization: Bearer $NEON_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"endpoint": {"settings": {"autoscaling_limit_min_cu": 0.25, "autoscaling_limit_max_cu": 0.25}}}' \
  "https://console.neon.tech/api/v2/projects/$NEON_PROJECT_ID/endpoints/$NEON_ENDPOINT_ID" \
  | python3 -c "
import json, sys
d = json.load(sys.stdin)
e = d.get('endpoint', {})
s = e.get('settings', {})
print(f'  ✓ Endpoint now: min={s.get(\"autoscaling_limit_min_cu\")} max={s.get(\"autoscaling_limit_max_cu\")}')"

echo ""
echo -e "${GREEN}✓ Neon RESUMED${NC}"

# VERCEL — Need dashboard
echo ""
echo "════════════════════════════════════════════════════════"
echo "VERCEL — Re-upgrade required via dashboard"
echo "════════════════════════════════════════════════════════"
echo "  https://vercel.com/dashboard/settings/billing"
echo "  Re-upgrade to Pro plan"
echo ""
echo "  Alternatively, if you PAUSED via API earlier, you can RESUME:"
echo "  POST https://api.vercel.com/v1/projects/$VERCEL_PROJECT_ID/unpause"
