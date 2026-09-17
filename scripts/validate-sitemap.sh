#!/bin/bash
# 2026-09-17: Sitemap XML validation script.
#
# Validates all deployed sitemap URLs return valid XML and have the expected
# structure (sitemapindex for /sitemap.xml, urlset for sub-sitemaps).
#
# Usage:
#   ./scripts/validate-sitemap.sh                       # validates prod
#   BASE_URL=http://localhost:3000 ./scripts/validate-sitemap.sh  # local
#
# Exit code 0 = all OK, non-zero = at least one sitemap invalid.

set -e

BASE_URL="${BASE_URL:-https://examanet.com}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# All sitemap endpoints to validate
SITEMAPS=(
  "sitemap.xml:sitemapindex"
  "sitemap-static.xml:urlset"
  "sitemap-classes.xml:urlset"
  "sitemap-subjects.xml:urlset"
  "sitemap-teachers.xml:urlset"
  "sitemap-resources-1.xml:urlset"
  "sitemap-resources-2.xml:urlset"
  "sitemap-resources-3.xml:urlset"
  "image-sitemap.xml:urlset"
)

FAILED=0
TOTAL=0

echo "🔍 Validating sitemaps at ${BASE_URL}"
echo ""

for entry in "${SITEMAPS[@]}"; do
  path="${entry%%:*}"
  expected_root="${entry##*:}"
  url="${BASE_URL}/${path}"
  TOTAL=$((TOTAL + 1))

  # Fetch the sitemap
  content=$(curl -sS -o /tmp/sitemap-validate.xml -w "%{http_code}" "$url" --max-time 30)
  http_status="$content"

  if [ "$http_status" != "200" ]; then
    echo -e "${RED}✗${NC} $path → HTTP $http_status"
    FAILED=$((FAILED + 1))
    continue
  fi

  size=$(wc -c < /tmp/sitemap-validate.xml)

  # Validate XML using Python (always available)
  if ! python3 -c "import xml.etree.ElementTree as ET; ET.parse('/tmp/sitemap-validate.xml')" 2>/dev/null; then
    echo -e "${RED}✗${NC} $path → INVALID XML (size=${size}b)"
    FAILED=$((FAILED + 1))
    continue
  fi

  # Check root element
  actual_root=$(python3 -c "
import xml.etree.ElementTree as ET
tree = ET.parse('/tmp/sitemap-validate.xml')
print(tree.getroot().tag.split('}')[-1])
" 2>/dev/null)

  if [ "$actual_root" != "$expected_root" ]; then
    echo -e "${RED}✗${NC} $path → wrong root: $actual_root (expected $expected_root)"
    FAILED=$((FAILED + 1))
    continue
  fi

  # Count URLs
  url_count=$(grep -c "<loc>" /tmp/sitemap-validate.xml 2>/dev/null || echo "?")

  if [ "$expected_root" = "sitemapindex" ]; then
    echo -e "${GREEN}✓${NC} $path → sitemapindex with $url_count sitemaps (${size}b)"
  else
    echo -e "${GREEN}✓${NC} $path → urlset with $url_count URLs (${size}b)"
  fi
done

echo ""
if [ "$FAILED" -eq 0 ]; then
  echo -e "${GREEN}✅ All $TOTAL sitemaps valid${NC}"
  exit 0
else
  echo -e "${RED}❌ $FAILED/$TOTAL sitemaps failed${NC}"
  exit 1
fi
