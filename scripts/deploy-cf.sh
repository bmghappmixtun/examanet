#!/bin/bash
# Cloudflare Workers deploy script — ISOLATED BRANCH (feature/cf-isolated)
# 
# This branch has CF config BAKED IN:
#   - src/lib/prisma.ts is the CF proxy (no swap needed)
#   - next.config.js has output:"standalone" + unoptimized:true (no mod needed)
#
# So this script is just: surgery + build + deploy. No Vercel involvement.
#
# Usage:
#   ./scripts/deploy-cf.sh            # build + deploy to CF
#   ./scripts/deploy-cf.sh build      # build only
#   ./scripts/deploy-cf.sh deploy     # deploy only (assumes already built)
#   ./scripts/deploy-cf.sh logs       # tail recent CF worker logs
#   ./scripts/deploy-cf.sh revert     # no-op on this branch (nothing to revert)

set -e

ACTION="${1:-all}"

# Ensure bun is in PATH (some CF build steps need it)
export PATH="/usr/local/bin:$PATH"

case "$ACTION" in
  revert)
    echo "→ Nothing to revert on feature/cf-isolated (CF config is baked in)"
    exit 0
    ;;
  logs)
    if [ -f scripts/cf-logs.sh ]; then
      exec scripts/cf-logs.sh "${2:-10}" "${3:-30}"
    else
      echo "scripts/cf-logs.sh not found" >&2
      exit 1
    fi
    ;;
  deploy)
    echo "→ Deploying to Cloudflare"
    CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE="postgresql://stub:stub@localhost:5432/stub" \
      npx wrangler deploy
    ;;
  build)
    echo "→ Applying CF bundle surgery"
    if [ -f scripts/surgery-cf.sh ]; then
      ./scripts/surgery-cf.sh
    else
      echo "  (no surgery script found, skipping)"
    fi

    echo "→ Running npx next build"
    rm -rf .next .open-next
    DATABASE_URL="${DATABASE_URL:-postgresql://stub:stub@localhost:5432/stub}"  npx next build 2>&1 | tail -5

    echo "→ Running opennextjs-cloudflare build"
    DATABASE_URL="${DATABASE_URL:-postgresql://stub:stub@localhost:5432/stub}" npx opennextjs-cloudflare build --skipNextBuild --dangerouslyUseUnsupportedNextVersion 2>&1 | tail -10

    echo "→ Stubbing Prisma native binary in bundle (saves 16MB)"
    if [ -f scripts/stub-prisma-binary.sh ]; then
      ./scripts/stub-prisma-binary.sh
    fi
    ;;
  all|"")
    "$0" build
    "$0" deploy
    ;;
  *)
    echo "Usage: $0 {build|deploy|all|logs [minutes] [limit]|revert}" >&2
    exit 1
    ;;
esac
