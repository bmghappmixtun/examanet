#!/bin/bash
# Install the pre-commit token-leak check
# Run once: bash scripts/security/install.sh
set -e
cd "$(git rev-parse --show-toplevel)"
git config core.hooksPath scripts/security/hooks
echo "✅ Pre-commit hook installed. Token leaks will be blocked."
echo "   Skip with: git commit --no-verify"
