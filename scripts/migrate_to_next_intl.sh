#!/bin/bash
# Migrate tServer → getTranslations from next-intl

# Find files using getT, getServerLocale, getDict from old i18n-server
FILES=$(grep -rln "from '@/lib/i18n-server'" src/ 2>/dev/null | grep -v "src/lib/i18n-server.ts" | grep -v "src/middleware.ts")

for f in $FILES; do
  echo "Processing: $f"
  
  # 1. Replace the import
  sed -i "s|import { getLocale, getT } from '@/lib/i18n-server';|import { getTranslations, getLocale } from 'next-intl/server';|g" "$f"
  sed -i "s|import { getT } from '@/lib/i18n-server';|import { getTranslations } from 'next-intl/server';|g" "$f"
  sed -i "s|import { getLocale } from '@/lib/i18n-server';|import { getLocale } from 'next-intl/server';|g" "$f"
  
  # 2. Replace `const t = getT();` with `const t = await getTranslations();`
  sed -i "s|const t = getT();|const t = await getTranslations();|g" "$f"
  
  # 3. Replace `getDict()` calls
  sed -i "s|getDict()|await getTranslations()|g" "$f"
done
echo "Done"
