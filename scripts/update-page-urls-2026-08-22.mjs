#!/usr/bin/env node
/**
 * Update page-level URLs to use localeUrl helper.
 * 
 * For each page, find patterns like:
 *   const PAGE_URL = `${SITE_URL}/path`;
 * And convert them to use localeUrl().
 * 
 * But this is too complex for an automated script because:
 * - Some pages have multiple PAGE_URL_*
 * - Some have PAGE_URL inside generateMetadata (has isAr scope)
 * - Some have PAGE_URL at module level (no isAr scope)
 * 
 * Manual approach: use the helper for each page
 */
import fs from 'fs';
import path from 'path';

const updates = [
  // [file, [old_strings, new_strings]]
  // We do string-level replacements
];

// Just check what URLs exist
const files = [
  'src/app/[locale]/a-propos/page.tsx',
  'src/app/[locale]/bac/archives/page.tsx',
  'src/app/[locale]/bac/page.tsx',
  'src/app/[locale]/cgu/page.tsx',
  'src/app/[locale]/college/page.tsx',
  'src/app/[locale]/concours-9eme-tunisie/page.tsx',
  'src/app/[locale]/concours-9eme-tunisie/sujets-passes/page.tsx',
  'src/app/[locale]/contact/page.tsx',
  'src/app/[locale]/faq/page.tsx',
  'src/app/[locale]/matieres/page.tsx',
  'src/app/[locale]/matieres/[subject]/page.tsx',
  'src/app/[locale]/niveaux/page.tsx',
  'src/app/[locale]/niveaux/[level]/page.tsx',
  'src/app/[locale]/professeurs/page.tsx',
  'src/app/[locale]/professeurs/[numericId]/[slug]/page.tsx',
  'src/app/[locale]/programme-officiel/page.tsx',
  'src/app/[locale]/recherche/page.tsx',
  'src/app/[locale]/referentiel-national/page.tsx',
];

for (const f of files) {
  const full = path.join(process.cwd(), f);
  if (!fs.existsSync(full)) continue;
  const content = fs.readFileSync(full, 'utf8');
  const matches = content.match(/PAGE_URL[A-Z_]* = `/g) || [];
  if (matches.length > 0) {
    console.log(`${f}: ${matches.length} PAGE_URL* consts`);
  }
  const m2 = content.match(/`\$\{SITE_URL\}\/[^`]+`/g) || [];
  if (m2.length > 0) {
    console.log(`  ${m2.length} \${SITE_URL}/... patterns: ${[...new Set(m2)].slice(0,5).join(' | ')}`);
  }
}
