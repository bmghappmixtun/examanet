/**
 * update-internal-links.mjs
 *
 * One-shot script to update all internal resource links to the new
 * /ressources/{numericId}/{slug} format.
 *
 * Replaces:
 *  - `/ressources/${r.slug}`  →  `/ressources/${r.numericId}/${r.slug}`
 *  - `/ressources/${r.slug}/viewer`  →  `/ressources/${r.numericId}/${r.slug}/viewer`
 *  - Similar patterns for `resource.slug`, `s.slug`, `f.resource.slug`, etc.
 *
 * This requires the caller to have a `numericId` property available in scope.
 * We update the link AND the surrounding code to ensure the variable is selected.
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const filesToUpdate = [
  // Pages
  'src/app/admin/analytics/page.tsx',
  'src/app/college/page.tsx',
  'src/app/enseignant/page.tsx',
  'src/app/enseignant/stats/page.tsx',
  'src/app/matieres/[subject]/page.tsx',
  'src/app/mon-compte/page.tsx',
  'src/app/professeurs/[id]/page.tsx',
  'src/app/ressources/page.tsx',
  // Components
  'src/components/niveaux/ClassAccordion.tsx',
  'src/components/resources/ResourceCard.tsx',
  'src/components/resources/ResourceListItem.tsx',
  'src/components/search/SearchResultsV2.tsx',
  // API routes
  'src/app/api/admin/resource/[id]/[action]/route.ts',
  'src/app/api/admin/resource/[id]/edit/route.ts',
  'src/app/api/resources/[id]/comments/route.ts',
  'src/app/api/search/suggest/route.ts',
  // Sitemap
  'src/app/sitemap.ts',
];

// For these, we'll do specific replacements
// The pattern: anywhere we use r.slug, resource.slug, s.slug, f.resource.slug
// in a URL like /ressources/..., we need to also include numericId

let totalChanges = 0;

for (const file of filesToUpdate) {
  if (!fs.existsSync(file)) {
    console.log(`⚠️  Skipping ${file} (not found)`);
    continue;
  }
  let content = fs.readFileSync(file, 'utf8');
  const before = content;

  // Common patterns to update:
  // 1. URL containing slug — add numericId
  content = content.replace(
    /\/ressources\/\$\{(r|resource|s|f\.resource|pending)\.slug\}(\/viewer)?/g,
    '/ressources/${$1.numericId}/${$1.slug}$2'
  );
  // 2. URL containing newSlug(pending) — also add numericId
  content = content.replace(
    /\/ressources\/\$\{newSlug\(pending\)\}(\/viewer)?/g,
    '/ressources/${pending.numericId}/${newSlug(pending)}$1'
  );
  // 3. In ResourceCard / ResourceListItem — variable may be `resource` in scope
  //    but the data we receive already has numericId (we just need to ensure it's selected)
  //    These will be handled by ensuring the Prisma select includes numericId

  if (content !== before) {
    fs.writeFileSync(file, content);
    const changes = (before.match(/\/ressources\/\$\{[^}]+\.slug\}/g) || []).length;
    console.log(`✅ ${file}: ${changes} replacements`);
    totalChanges += changes;
  } else {
    console.log(`   ${file}: no changes`);
  }
}

console.log(`\nTotal replacements: ${totalChanges}`);

// Now ensure the Prisma queries that fetch resources for these pages include numericId.
// This is critical — without numericId in the select, the link will be `/ressources/undefined/...`
console.log('\n=== Check Prisma selects in updated files ===');
const selectChecks = [
  'src/app/ressources/page.tsx',
  'src/components/resources/ResourceCard.tsx',
  'src/components/resources/ResourceListItem.tsx',
  'src/components/niveaux/ClassAccordion.tsx',
  'src/components/search/SearchResultsV2.tsx',
  'src/app/college/page.tsx',
  'src/app/matieres/[subject]/page.tsx',
  'src/app/admin/analytics/page.tsx',
  'src/app/enseignant/page.tsx',
  'src/app/enseignant/stats/page.tsx',
  'src/app/mon-compte/page.tsx',
  'src/app/professeurs/[id]/page.tsx',
  'src/app/api/search/suggest/route.ts',
];

for (const f of selectChecks) {
  if (!fs.existsSync(f)) continue;
  const c = fs.readFileSync(f, 'utf8');
  const hasSlug = /select:.*slug:.*true|select:.*slug[^a-zA-Z]/.test(c);
  const hasNumericId = /numericId:/.test(c);
  console.log(`${hasNumericId ? '✅' : '❌'} ${f}: has slug=${hasSlug}, has numericId=${hasNumericId}`);
}
