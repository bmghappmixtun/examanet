#!/bin/bash
# Phase 9 SUSPEND (non-destructive) — Vercel + Neon
# 
# Usage:
#   1. Get your tokens:
#      - Vercel: https://vercel.com/account/tokens (Create Token, scope: Full Account)
#      - Neon:   https://console.neon.tech/app/settings/api-keys (Create new key)
#   2. Run: VERCEL_TOKEN=xxx NEON_API_KEY=yyy bash scripts/phase9-suspend.sh
#   3. Confirm at each step (Y/n)
#   4. To RESTORE: bash scripts/phase9-restore.sh (creates if needed)
#
# SAFE: only scales/suspends, never deletes. Data is preserved.

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

if [ -z "$VERCEL_TOKEN" ]; then
  echo -e "${RED}❌ VERCEL_TOKEN not set${NC}"
  echo "  Get one at: https://vercel.com/account/tokens"
  exit 1
fi

if [ -z "$NEON_API_KEY" ]; then
  echo -e "${RED}❌ NEON_API_KEY not set${NC}"
  echo "  Get one at: https://console.neon.tech/app/settings/api-keys"
  exit 1
fi

# ============================================================
# 1. NEON — List projects
# ============================================================
echo ""
echo "════════════════════════════════════════════════════════"
echo "1. NEON — List projects"
echo "════════════════════════════════════════════════════════"
NEON_PROJECTS=$(curl -sS -H "Authorization: Bearer $NEON_API_KEY" "https://console.neon.tech/api/v2/projects")
echo "$NEON_PROJECTS" | python3 -c "
import json, sys
d = json.load(sys.stdin)
for p in d.get('projects', []):
    region = p.get('region_id', 'N/A')
    name = p.get('name', 'unnamed')
    pid = p.get('id', '?')
    print(f'  {pid}  {name:30s}  region={region}')
"

# Try to auto-detect the examanet project
NEON_PROJECT_ID=$(echo "$NEON_PROJECTS" | python3 -c "
import json, sys
d = json.load(sys.stdin)
for p in d.get('projects', []):
    if 'examanet' in (p.get('name','') + p.get('id','')).lower():
        print(p['id'])
        break
")
if [ -z "$NEON_PROJECT_ID" ]; then
  echo ""
  echo -e "${YELLOW}⚠️ Could not auto-detect examanet Neon project${NC}"
  echo -n "Enter the Neon project ID (from list above): "
  read NEON_PROJECT_ID
fi
echo ""
echo "  → Will suspend Neon project: $NEON_PROJECT_ID"

# ============================================================
# 2. NEON — List endpoints
# ============================================================
echo ""
echo "════════════════════════════════════════════════════════"
echo "2. NEON — List endpoints for project $NEON_PROJECT_ID"
echo "════════════════════════════════════════════════════════"
NEON_ENDPOINTS=$(curl -sS -H "Authorization: Bearer $NEON_API_KEY" "https://console.neon.tech/api/v2/projects/$NEON_PROJECT_ID/endpoints")
echo "$NEON_ENDPOINTS" | python3 -c "
import json, sys
d = json.load(sys.stdin)
for e in d.get('endpoints', []):
    eid = e.get('id', '?')
    cur = e.get('settings', {}).get('autoscaling_limit_min_cu', '?')
    max_cu = e.get('settings', {}).get('autoscaling_limit_max_cu', '?')
    host = e.get('host', '?')
    print(f'  {eid}  min={cur} max={max_cu}  host={host}')
"

NEON_ENDPOINT_ID=$(echo "$NEON_ENDPOINTS" | python3 -c "
import json, sys
d = json.load(sys.stdin)
for e in d.get('endpoints', []):
    if e.get('type') == 'read_write':
        print(e['id'])
        break
")
if [ -z "$NEON_ENDPOINT_ID" ]; then
  NEON_ENDPOINT_ID=$(echo "$NEON_ENDPOINTS" | python3 -c "
import json, sys
d = json.load(sys.stdin)
e = d.get('endpoints', [{}])[0]
if e: print(e.get('id', ''))
")
fi
echo ""
echo "  → Will pause endpoint: $NEON_ENDPOINT_ID"

# ============================================================
# 3. NEON — Scale to 0 (pause compute)
# ============================================================
echo ""
echo "════════════════════════════════════════════════════════"
echo "3. NEON — Scale endpoint to 0 (PAUSE)"
echo "════════════════════════════════════════════════════════"
echo -e "${YELLOW}This will set min_cu=0 and max_cu=0 on the endpoint.${NC}"
echo -e "${YELLOW}Compute will stop. Data is preserved. You can resume anytime.${NC}"
echo -n "Continue? [y/N] "
read -r CONFIRM
if [[ ! "$CONFIRM" =~ ^[Yy]$ ]]; then
  echo "  Aborted."
  exit 0
fi

curl -sS -X PATCH \
  -H "Authorization: Bearer $NEON_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"endpoint": {"settings": {"autoscaling_limit_min_cu": 0, "autoscaling_limit_max_cu": 0}}}' \
  "https://console.neon.tech/api/v2/projects/$NEON_PROJECT_ID/endpoints/$NEON_ENDPOINT_ID" \
  | python3 -c "
import json, sys
d = json.load(sys.stdin)
e = d.get('endpoint', {})
s = e.get('settings', {})
print(f'  ✓ Endpoint {e.get(\"id\")[:8]}... now: min={s.get(\"autoscaling_limit_min_cu\")} max={s.get(\"autoscaling_limit_max_cu\")}')"

echo ""
echo -e "${GREEN}✓ Neon is now PAUSED${NC}"
echo "  - Data is preserved"
echo "  - Compute will wake on next query (~5s cold start)"
echo "  - To RESTORE: max_cu=0.25 via the same API"

# ============================================================
# 4. VERCEL — List projects
# ============================================================
echo ""
echo "════════════════════════════════════════════════════════"
echo "4. VERCEL — List projects"
echo "════════════════════════════════════════════════════════"
VERCEL_PROJECTS=$(curl -sS -H "Authorization: Bearer $VERCEL_TOKEN" "https://api.vercel.com/v9/projects")
echo "$VERCEL_PROJECTS" | python3 -c "
import json, sys
d = json.load(sys.stdin)
for p in d.get('projects', []):
    name = p.get('name', '?')
    pid = p.get('id', '?')
    framework = p.get('framework', '?')
    print(f'  {pid}  {name:30s}  framework={framework}')
"

VERCEL_PROJECT_ID=$(echo "$VERCEL_PROJECTS" | python3 -c "
import json, sys
d = json.load(sys.stdin)
for p in d.get('projects', []):
    n = p.get('name', '').lower()
    if 'examanet' in n or 'edutunisie' in n:
        print(p['id'])
        break
")
if [ -z "$VERCEL_PROJECT_ID" ]; then
  echo ""
  echo -e "${YELLOW}⚠️ Could not auto-detect Vercel project${NC}"
  echo -n "Enter the Vercel project ID (from list above): "
  read VERCEL_PROJECT_ID
fi
echo ""
echo "  → Will downgrade Vercel project: $VERCEL_PROJECT_ID"

# ============================================================
# 5. VERCEL — Downgrade to Hobby (free)
# ============================================================
echo ""
echo "════════════════════════════════════════════════════════"
echo "5. VERCEL — Downgrade to Hobby (PAUSE payments)"
echo "════════════════════════════════════════════════════════"
echo -e "${YELLOW}This will downgrade the project to the free Hobby plan.${NC}"
echo -e "${YELLOW}No more monthly charges. Project stays deployed under quota.${NC}"
echo -e "${YELLOW}If the site has real traffic, it may auto-suspend (but never deleted).${NC}"
echo ""
echo "  Alternative: REMOVE PAYMENT METHOD in Vercel Billing instead"
echo "  (more surgical — no project state change)"
echo ""
echo -n "Downgrade to Hobby plan? [y/N] "
read -r CONFIRM
if [[ ! "$CONFIRM" =~ ^[Yy]$ ]]; then
  echo ""
  echo "  Skipped Vercel downgrade. You can do it manually via:"
  echo "  https://vercel.com/dashboard/[project]/settings/billing"
  echo ""
  echo "════════════════════════════════════════════════════════"
  echo "RESULT"
  echo "════════════════════════════════════════════════════════"
  echo -e "${GREEN}✓ Neon PAUSED (scale to 0)${NC}"
  echo "  Vercel: SKIPPED (do manually via dashboard)"
  echo ""
  echo "  Total savings: ~$15-20/month (Neon paused)"
  echo "  Vercel still active (~$20/month until you downgrade)"
  exit 0
fi

# Note: Vercel API doesn't allow self-service plan downgrade via API.
# It requires dashboard action. We just confirm here.
echo ""
echo -e "${YELLOW}⚠️ Vercel plan downgrade requires dashboard action:${NC}"
echo "  1. https://vercel.com/dashboard/$VERCEL_PROJECT_ID/settings/billing"
echo "  2. Click 'Downgrade to Hobby' or 'Remove payment method'"
echo ""
echo "After downgrading, you can ALSO (optionally):"
echo "  - Pause deployments: PATCH /v9/projects/$VERCEL_PROJECT_ID/pause"
echo "  - Cancel active deployments"
echo ""

# Try to pause the project
echo -n "Also pause deployments via API? [y/N] "
read -r CONFIRM
if [[ "$CONFIRM" =~ ^[Yy]$ ]]; then
  PAUSE_RESULT=$(curl -sS -X POST \
    -H "Authorization: Bearer $VERCEL_TOKEN" \
    "https://api.vercel.com/v1/projects/$VERCEL_PROJECT_ID/pause" 2>&1)
  if echo "$PAUSE_RESULT" | grep -q "404"; then
    echo ""
    echo -e "${YELLOW}⚠️ /v1/projects/.../pause is deprecated${NC}"
    echo "  The new Vercel API uses PATCH /v9/projects/{idOrName} with { paused: true }"
  else
    echo "  ✓ Pause response: $(echo "$PAUSE_RESULT" | head -c 200)"
  fi
fi

echo ""
echo "════════════════════════════════════════════════════════"
echo "FINAL RESULT"
echo "════════════════════════════════════════════════════════"
echo -e "${GREEN}✓ Neon PAUSED (scale to 0, data preserved)${NC}"
echo "  Vercel: downgrade required via dashboard"
echo ""
echo "Estimated monthly cost now: \$0-5 (just Cloudflare usage)"
echo ""
echo "To RESTORE:"
echo "  - Neon: PATCH endpoint max_cu back to 0.25"
echo "  - Vercel: re-upgrade plan via dashboard"
