#!/bin/bash
# 2026-07-30: Vercel Ignore Build Step (Vercel build time optimization).
#
# Vercel runs this before each build. Exit 0 = skip build (cancel deploy).
# Exit 1 = continue with build.
#
# Strategy: skip preview builds for trivial changes (markdown, scripts,
# untracked files). Always build production + when source code changes.
#
# See: https://vercel.com/docs/builds/managing-builds#ignore-build-step

echo "--- vercel-ignore.sh ---"
echo "Branch: $VERCEL_GIT_COMMIT_REF"
echo "Commit msg: $VERCEL_GIT_COMMIT_MESSAGE"
echo "Env: $VERCEL_ENV"

# CRITICAL: Skip ALL Cloudflare/CF-only branches - they target CF Workers, not Vercel
# 2026-08-26: After GitLab migration, all CF work happens on GitLab
# These branches should NEVER trigger a Vercel build
CF_BRANCH_PATTERN='^(feature/cf-isolated|feature/d1-migration|feature/opennext-cloudflare|feature/cf-)'
if [[ "$VERCEL_GIT_COMMIT_REF" =~ $CF_BRANCH_PATTERN ]]; then
  echo "→ CF-only branch ($VERCEL_GIT_COMMIT_REF): SKIP Vercel build entirely"
  exit 0
fi

# Always build production
if [ "$VERCEL_ENV" = "production" ]; then
  echo "→ production env: always build"
  exit 1
fi

# Skip preview if only these paths changed
CHANGED=$(git diff --name-only HEAD~1 HEAD 2>/dev/null)
if [ -z "$CHANGED" ]; then
  # First commit, no diff possible — build
  echo "→ no diff available, build"
  exit 1
fi

# If only non-app paths changed, skip
SKIP_PATTERN='^(\.github|docs|scripts|pdf-test|\.md|\.gitignore|README)'
APP_CHANGES=$(echo "$CHANGED" | grep -vE "$SKIP_PATTERN" || true)

if [ -z "$APP_CHANGES" ]; then
  echo "→ only docs/scripts changed, skip build"
  exit 0
fi

echo "→ app changes detected, build"
exit 1
