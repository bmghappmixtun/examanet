#!/bin/bash
# Setup CF secrets for the POC worker

set -e
WORKER_NAME="examanet-poc"
ENV_FILE="${ENV_FILE:-.env.local}"

SECRETS=(
  "DATABASE_URL"
  "NEXTAUTH_SECRET"
  "GOOGLE_CLIENT_ID"
  "GOOGLE_CLIENT_SECRET"
  "RESEND_API_KEY"
  "JOTFORM_API_KEY"
  "CRON_SECRET"
)

echo "→ Setting POC worker secrets: $WORKER_NAME"
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
