#!/bin/bash
# Pre-push security check: refuse to push if any file contains a GitHub token pattern
# 
# Setup (run once):
#   git config core.hooksPath scripts/security/hooks
# 
# Skip for one push:
#   git push --no-verify

PATTERN='ghp_[A-Za-z0-9]{36}|github_pat_[A-Za-z0-9_]{82}|ghs_[A-Za-z0-9]{36}|gho_[A-Za-z0-9]{36}|ghu_[A-Za-z0-9]{36}|ghr_[A-Za-z0-9]{36}'

LEAKS=$(git diff --cached --name-only | xargs grep -lE "$PATTERN" 2>/dev/null)

if [ -n "$LEAKS" ]; then
  echo "❌ REFUSED: GitHub token pattern detected in staged files:"
  echo "$LEAKS"
  echo ""
  echo "If this is a false positive, use 'git commit --no-verify' to skip."
  exit 1
fi
