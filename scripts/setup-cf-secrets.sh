#!/bin/bash
# Setup Cloudflare Worker secrets from .env.local
# 
# Usage:
#   1. npx wrangler login --device
#   2. ./scripts/setup-cf-secrets.sh [worker-name]
#
# Default worker-name: examanet-prod

set -e
WORKER_NAME="${1:-examanet-prod}"
ENV_FILE="${ENV_FILE:-.env.local}"

if [ ! -f "$ENV_FILE" ]; then
  echo "❌ $ENV_FILE not found"
  exit 1
fi

# Secrets to push (the rest are public)
SECRETS=(
  "DATABASE_URL"
  "NEXTAUTH_SECRET"
  "GOOGLE_CLIENT_ID"
  "GOOGLE_CLIENT_SECRET"
  "RESEND_API_KEY"
  "BLOB_READ_WRITE_TOKEN"
  "JOTFORM_API_KEY"
  "CRON_SECRET"
  "GITHUB_TOKEN"
  "NEON_API_KEY"
  "VERCEL_DEPLOY_HOOK"
  "DISCORD_WEBHOOK_URL"
  "AGENT_REPORT_TOKEN"
  "AGENT_EMAIL"
  "CONTACT_EMAIL"
  "STATSIG_SERVER_KEY"
)

echo "→ Setting secrets for worker: $WORKER_NAME"

for SECRET in "${SECRETS[@]}"; do
  VALUE=$(grep "^$SECRET=" "$ENV_FILE" | cut -d'"' -f2 2>/dev/null)
  if [ -z "$VALUE" ]; then
    VALUE=$(grep "^$SECRET=" "$ENV_FILE" | cut -d"'" -f2 2>/dev/null)
  fi
  if [ -z "$VALUE" ]; then
    echo "  ⚠️  $SECRET: not found in $ENV_FILE, skipping"
    continue
  fi
  echo -n "  $SECRET: "
  echo "$VALUE" | npx wrangler secret put "$SECRET" --name "$WORKER_NAME" 2>&1 | tail -1 || echo "FAILED"
done

echo "✅ Done"
