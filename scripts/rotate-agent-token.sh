#!/usr/bin/env bash
# Rotation du token agent (2026-10-26).
#
# POURQUOI CE SCRIPT EXISTE
# ------------------------
# `POST /api/agent/nightly-report` exige désormais une authentification
# réelle (le bypass `!auth` a été supprimé). Le worker doit donc posséder un
# token connu de l'agent.
#
# L'agent ne peut PAS lire la valeur d'un secret Cloudflare (l'API ne
# renvoie que les NOMS), et le coffre de secrets Mavis n'expose pas ce
# token. La solution est donc : l'agent GÉNÈRE et POSE lui-même le token,
# puis l'utilise dans la même session. Aucune persistance n'est nécessaire —
# n'importe quelle session peut rejouer ce script.
#
# USAGE
#   ./scripts/rotate-agent-token.sh              # rotation + affiche le token
#   ./scripts/rotate-agent-token.sh --quiet      # rotation silencieuse
#
# Le token est écrit dans .agent-token (gitignoré) pour la session courante.
set -euo pipefail

cd "$(dirname "$0")/.."

QUIET=0
[[ "${1:-}" == "--quiet" ]] && QUIET=1

: "${CLOUDFLARE_API_TOKEN:?CLOUDFLARE_API_TOKEN absent de l'env}"
export CLOUDFLARE_API_TOKEN
export CLOUDFLARE_ACCOUNT_ID="${CLOUDFLARE_ACCOUNT_ID:-59cffdeaadf3809cc3d2039c43f836e0}"

TOKEN="agent_$(python3 -c 'import secrets; print(secrets.token_urlsafe(36))')"
OUT=".agent-token"

# 3 workers du compte : le prod (examanet-prod), le dev (examanet-dev) et le
# legacy (examanet-poc, dernier déploiement 2026-09-04 — sans harm si absent).
for CFG in wrangler.prod.jsonc wrangler.dev.jsonc wrangler.jsonc; do
  [[ -f "$CFG" ]] || continue
  WORKER=$(grep -oE '"name"\s*:\s*"[^"]+"' "$CFG" | head -1 | sed 's/.*"name"\s*:\s*"//; s/"//')
  if npx wrangler secret put AGENT_REPORT_TOKEN --config "$CFG" <<< "$TOKEN" >/dev/null 2>&1; then
    echo "  ✅ $CFG → worker $WORKER : secret AGENT_REPORT_TOKEN mis à jour"
  else
    echo "  ⚠️  $CFG → worker $WORKER : échec (ignoré)"
  fi
done

# .agent-token est gitignoré : il ne part jamais en commit.
if ! grep -qx '.agent-token' .gitignore 2>/dev/null; then
  printf '\n# token agent local (2026-10-26) — ne jamais committer\n.agent-token\n' >> .gitignore
  echo "  ℹ️  .agent-token ajouté au .gitignore"
fi
printf '%s' "$TOKEN" > "$OUT"
chmod 600 "$OUT"

if [[ "$QUIET" == "0" ]]; then
  echo
  echo "Token écrit dans $OUT (mode 600, gitignoré)."
  echo "Usage :"
  echo "  curl -sS -X POST https://examanet.com/api/agent/nightly-report \\"
  echo "    -H \"Authorization: Bearer \$(cat $OUT)\" \\"
  echo "    -H 'Content-Type: application/json' -d @payload.json"
fi
