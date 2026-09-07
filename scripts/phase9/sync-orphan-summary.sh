#!/bin/bash
# Find orphan users (in Neon but not in D1) and sync them
# Usage: bash scripts/phase9/sync-orphan-summary.sh

set -e
echo "=== Checking for orphan users (in Neon but not in D1) ==="
node scripts/phase9/find-missing-users.mjs
