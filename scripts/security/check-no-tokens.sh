#!/bin/bash
set -e

RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
NC='\033[0m'

ERRORS=0

echo "→ Pre-commit security check..."

# 1. Block dangerous paths
BLOCKED_PATTERNS=(
  "^secrets/"
  "^_screenshots/"
  "^\.d1-id$"
  "^\.env$"
  "^\.env\.local$"
  "^\.env\.development$"
  "^\.env\.production$"
  "credentials\.json$"
  "service-account.*\.json$"
)

STAGED_NAMES=$(git diff --cached --name-only 2>/dev/null)
for pattern in "${BLOCKED_PATTERNS[@]}"; do
  HIT=$(echo "$STAGED_NAMES" | grep -E "$pattern" || true)
  if [ -n "$HIT" ]; then
    echo -e "${RED}✗ BLOCKED path: '$pattern'${NC}"
    echo "$HIT" | head -3 | sed 's/^/    /'
    ERRORS=$((ERRORS + 1))
  fi
done

# 2. Block hardcoded secrets (with _ and - support for real secrets)
SECRET_PATTERNS=(
  "npg_[A-Za-z0-9_-]{20,}"
  "napi_[A-Za-z0-9_-]{20,}"
  "AKIA[0-9A-Z]{16}"
  "AIza[0-9A-Za-z_-]{35}"
  "ghp_[A-Za-z0-9]{36}"
  "github_pat_[A-Za-z0-9_]{82}"
  "ghs_[A-Za-z0-9]{36}"
  "gho_[A-Za-z0-9]{36}"
  "ghr_[A-Za-z0-9]{36}"
  "ghu_[A-Za-z0-9]{36}"
  "glpat-[A-Za-z0-9_-]{20,}"
  "vercel_blob_rw_[A-Za-z0-9_-]{20,}"
)

for pattern in "${SECRET_PATTERNS[@]}"; do
  HITS=""
  for f in $STAGED_NAMES; do
    if [ -f "$f" ] && file "$f" 2>/dev/null | grep -qE "text|JSON|script|source"; then
      if git diff --cached -- "$f" 2>/dev/null | grep -E "^\+[^+]" | grep -qE "$pattern"; then
        HITS="$HITS $f"
      fi
    fi
  done
  if [ -n "$HITS" ]; then
    echo -e "${RED}✗ BLOCKED: pattern '$pattern' in:${NC}"
    echo "$HITS" | tr ' ' '\n' | grep -v '^$' | head -3 | sed 's/^/    /'
    ERRORS=$((ERRORS + 1))
  fi
done

# 3. Large files
LARGE_FILES=""
for f in $STAGED_NAMES; do
  if [ -f "$f" ]; then
    SIZE=$(stat -c%s "$f" 2>/dev/null || echo 0)
    if [ "$SIZE" -gt 5242880 ]; then
      LARGE_FILES="$LARGE_FILES $f ($((SIZE / 1024 / 1024))MB)"
    fi
  fi
done
if [ -n "$LARGE_FILES" ]; then
  echo -e "${YELLOW}⚠ Large files staged:${NC}"
  echo "$LARGE_FILES" | tr ' ' '\n' | head -3 | sed 's/^/    /'
fi

if [ $ERRORS -gt 0 ]; then
  echo -e "${RED}✗ Commit BLOCKED${NC}"
  exit 1
fi

echo -e "${GREEN}✓ Pre-commit check passed${NC}"
