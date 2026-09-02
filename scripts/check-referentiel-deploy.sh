#!/bin/bash
# Vérifie l'état du déploiement Vercel de la page /referentiel-national
# Usage: ./check-referentiel-deploy.sh [url]
URL="${1:-https://examanet.com/referentiel-national}"

echo "════════════════════════════════════════════════════"
echo "  Vercel deploy check: $URL"
echo "════════════════════════════════════════════════════"
echo ""

# 1. HTTP status + Vercel headers
echo "📡 HTTP / Vercel headers:"
curl -sI "$URL" --max-time 10 | grep -iE "^HTTP|^x-vercel|^x-now|^server|^content-type" | head -8
echo ""

# 2. Page title
echo "📄 Page <title>:"
curl -sL "$URL" --max-time 10 2>/dev/null | grep -oE "<title[^<]*</title>" | head -1
echo ""

# 3. Layout integration check (Header + Footer should reference Examanet)
echo "🧩 Layout integration:"
HTML=$(curl -sL "$URL" --max-time 10 2>/dev/null)
HEADER_COUNT=$(echo "$HTML" | grep -cE "aria-label=\"Examanet|<header\b|nav.*Ressources|nav.*Niveaux" )
FOOTER_COUNT=$(echo "$HTML" | grep -cE "<footer\b|Ressources|<footer" )
REF_COUNT=$(echo "$HTML" | grep -cE "Référentiel|Système Éducatif" )
echo "   Header markers:  $HEADER_COUNT"
echo "   Footer markers:  $FOOTER_COUNT"
echo "   Contenu markers: $REF_COUNT (attendu > 0)"
echo ""

# 4. Deploy fingerprint (compare à la version précédente)
DEPLOY_ID=$(curl -sI "$URL" --max-time 10 2>/dev/null | grep -i "^x-vercel-id" | awk '{print $2}' | tr -d '\r')
echo "🔖 Deploy ID courant: $DEPLOY_ID"
echo ""
