#!/usr/bin/env node
/**
 * Fix canonical URLs in [locale] pages
 * 
 * For each page, check if canonical is like '/path' (no locale prefix)
 * If so, update it to be isAr ? '/ar/path' : '/fr/path'
 */
import fs from 'fs';
import path from 'path';

const files = [
  'src/app/[locale]/a-propos/page.tsx',
  'src/app/[locale]/bac/archives/page.tsx',
  'src/app/[locale]/bac/page.tsx',
  'src/app/[locale]/cgu/page.tsx',
  'src/app/[locale]/college/page.tsx',
  'src/app/[locale]/concours-9eme-tunisie/page.tsx',
  'src/app/[locale]/concours-9eme-tunisie/sujets-passes/page.tsx',
  'src/app/[locale]/contact/page.tsx',
  'src/app/[locale]/enseignants/rejoindre/page.tsx',
  'src/app/[locale]/faq/page.tsx',
  'src/app/[locale]/matieres/[subject]/page.tsx',
  'src/app/[locale]/matieres/page.tsx',
  'src/app/[locale]/niveaux/[level]/page.tsx',
  'src/app/[locale]/niveaux/page.tsx',
  'src/app/[locale]/outils/moyenne-bac/page.tsx',
  'src/app/[locale]/page.tsx',
  'src/app/[locale]/professeurs/[numericId]/[slug]/page.tsx',
  'src/app/[locale]/professeurs/page.tsx',
  'src/app/[locale]/programme-officiel/page.tsx',
  'src/app/[locale]/recherche/page.tsx',
  'src/app/[locale]/referentiel-national/page.tsx',
];

for (const file of files) {
  const fullPath = path.join(process.cwd(), file);
  if (!fs.existsSync(fullPath)) {
    console.log(`SKIP: ${file} (not found)`);
    continue;
  }
  let content = fs.readFileSync(fullPath, 'utf8');
  const orig = content;
  
  // Pattern: `canonical: '/path'` (no locale prefix)
  // We need to change it to `isAr ? canonical: '/ar/path' : '/fr/path'`
  // But the structure varies. Let's do simple replacements:
  // 1. `isAr ? { canonical: '/X' } : { canonical: '/X' }` → different per locale
  // 2. `canonical: '/X'` (single) → also prefix with locale
  
  // For now, let me handle the simplest case:
  // canonical: '/path' (within an `alternates:` block, FR-only context)
  // 
  // We need context: does the page have an `isAr` variable?
  
  // For pages without isAr, we'll add it via a simpler pattern:
  // `alternates: { canonical: '/path' }` → use PAGE_URL with locale
  
  // Simpler: convert `isAr ? { canonical: '/X' } : { canonical: '/X' }`
  // → `isAr ? { canonical: '/ar/X' } : { canonical: '/fr/X' }`
  content = content.replace(
    /isAr \? \{ canonical: '(\/[^']+)' \} : \{ canonical: '(\/[^']+)' \}/g,
    (match, arPath, frPath) => {
      if (arPath.startsWith('/ar/') || arPath === '/ar') {
        return match; // already has /ar prefix
      }
      return `isAr ? { canonical: '${arPath.replace(/^\//, '/ar/')}' } : { canonical: '${frPath.replace(/^\//, '/fr/')}' }`;
    }
  );
  
  // For pages that don't use isAr: `alternates: { canonical: '/X' }` 
  // We need to know the locale. For now, leave as-is and add a comment.
  
  if (content !== orig) {
    fs.writeFileSync(fullPath, content, 'utf8');
    console.log(`UPDATED: ${file}`);
  } else {
    console.log(`NO CHANGES: ${file}`);
  }
}
