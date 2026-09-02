/**
 * regenerate-all-slugs.mjs
 *
 * Comprehensive slug + title cleanup for all resources.
 *
 * Fixes:
 * 1. Strip cuid 6-char suffix from end of slug (e.g. "...-DdGvod")
 * 2. Properly transliterate accents (synthse → synthese, corrige → corrige)
 * 3. Strip file extensions from slugs (".pdf", "24pdf" → "24")
 * 4. Decode HTML entities in titles (&amp;amp; → &, &#x27; → ')
 * 5. Handle duplicates by appending -2, -3, etc.
 * 6. Save old → new mapping in ResourceSlugRedirect (for 301 redirects)
 * 7. Truncate slugs to 80 chars max
 * 8. Remove multiple consecutive hyphens
 *
 * The new slugify follows IRI-safe ASCII transliteration for French,
 * keeps Arabic letters for Arabic titles, and preserves digits.
 *
 * Run on a small DRY_RUN=1 first to preview changes.
 */

import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();

const DRY_RUN = process.env.DRY_RUN === '1';

// ============================================================================
// PROPER SLUGIFY
// ============================================================================

/**
 * Decode HTML entities (double-encoded → plain text)
 */
function decodeHtmlEntities(text) {
  if (!text) return '';
  let result = text;
  // Decode multiple times to handle double-encoding
  for (let i = 0; i < 3; i++) {
    const before = result;
    result = result
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&#x27;/g, "'")
      .replace(/&apos;/g, "'")
      .replace(/&nbsp;/g, ' ')
      .replace(/&hellip;/g, '...')
      .replace(/&mdash;/g, '—')
      .replace(/&ndash;/g, '–')
      .replace(/&eacute;/g, 'é')
      .replace(/&egrave;/g, 'è')
      .replace(/&agrave;/g, 'à')
      .replace(/&ccedil;/g, 'ç')
      .replace(/&iuml;/g, 'ï')
      .replace(/&ouml;/g, 'ö')
      .replace(/&ugrave;/g, 'ù')
      .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n)))
      .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)));
    if (before === result) break;
  }
  return result;
}

/**
 * Proper slugify: transliterates accents, keeps Arabic letters, handles
 * Unicode, normalizes whitespace and hyphens.
 *
 * Steps:
 *  1. Decode HTML entities
 *  2. Lowercase
 *  3. NFD normalize + strip combining diacritics (é → e, à → a)
 *  4. Apply specific French accent map (in case NFD missed)
 *  5. Replace non-letter/non-digit (except Arabic) with hyphens
 *  6. Collapse multiple hyphens, trim hyphens at edges
 *  7. Truncate to 60 chars (preserving word boundaries)
 */
function properSlugify(text) {
  if (!text) return '';
  let s = decodeHtmlEntities(text);

  // Strip file extensions from titles like "Série Equilibres chimiques 24.pdf"
  s = s.replace(/\.pdf$/i, '').replace(/\.docx?$/i, '').replace(/\.odt$/i, '');

  s = s.toLowerCase().trim();

  // NFD: decompose accented chars into base + combining diacritic
  // é → e + ́  → strip  ́ → e
  s = s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  // Specific French char map (handles cases NFD might miss)
  s = s
    .replace(/[àáâãäå]/g, 'a')
    .replace(/[èéêë]/g, 'e')
    .replace(/[ìíîï]/g, 'i')
    .replace(/[òóôõö]/g, 'o')
    .replace(/[ùúûü]/g, 'u')
    .replace(/[ç]/g, 'c')
    .replace(/[ñ]/g, 'n')
    .replace(/[ýÿ]/g, 'y');

  // Keep:
  //  - ASCII letters a-z
  //  - Digits 0-9
  //  - Arabic Unicode block: \u0600-\u06FF
  //  - Hyphens (will be normalized)
  // Replace everything else with hyphens
  s = s.replace(/[^a-z0-9\u0600-\u06FF]+/g, '-');

  // Collapse multiple hyphens
  s = s.replace(/-+/g, '-');

  // Trim hyphens at edges
  s = s.replace(/^-+|-+$/g, '');

  // Truncate to 60 chars at word boundary (avoid orphan characters)
  if (s.length > 60) {
    const truncated = s.substring(0, 60);
    const lastHyphen = truncated.lastIndexOf('-');
    if (lastHyphen > 30) {
      s = truncated.substring(0, lastHyphen);
    } else {
      s = truncated;
    }
  }

  return s;
}

// ============================================================================
// MAIN
// ============================================================================

const all = await p.resource.findMany({
  where: { status: 'PUBLISHED' },
  select: { id: true, slug: true, title: true }
});

console.log(`Loaded ${all.length} resources\n`);

const stats = {
  total: 0,
  slugChanged: 0,
  titleChanged: 0,
  titleDecoded: 0,
  cuidStripped: 0,
  accentsRestored: 0,
  pdfStripped: 0,
  duplicatesResolved: 0,
  errors: 0,
};

const slugMap = new Map(); // new slug → resource id
const changes = [];

// First pass: compute new slug for each resource
const plans = all.map(r => {
  const newTitle = decodeHtmlEntities(r.title || '');
  let newSlug = properSlugify(r.title || '');
  // Ensure non-empty
  if (!newSlug) newSlug = `resource-${r.id.slice(-8).toLowerCase()}`;
  return { id: r.id, oldSlug: r.slug, oldTitle: r.title, newSlug, newTitle };
});

// Second pass: handle duplicates
for (let i = 0; i < plans.length; i++) {
  const plan = plans[i];
  if (slugMap.has(plan.newSlug)) {
    // Duplicate: append counter
    let counter = 2;
    let candidate = `${plan.newSlug}-${counter}`;
    while (slugMap.has(candidate)) {
      counter++;
      candidate = `${plan.newSlug}-${counter}`;
      if (counter > 100) {
        // Shouldn't happen — just add a unique suffix
        candidate = `${plan.newSlug}-${plan.id.slice(-6).toLowerCase()}`;
        break;
      }
    }
    plan.newSlug = candidate;
    stats.duplicatesResolved++;
  }
  slugMap.set(plan.newSlug, plan.id);
}

// Third pass: apply changes
let processed = 0;
for (const plan of plans) {
  processed++;
  stats.total++;

  const slugChanged = plan.oldSlug !== plan.newSlug;
  const titleChanged = (plan.oldTitle || '') !== plan.newTitle;

  if (!slugChanged && !titleChanged) continue;

  stats.slugChanged += slugChanged ? 1 : 0;
  stats.titleChanged += titleChanged ? 1 : 0;

  // Track what changed
  if (slugChanged) {
    if (/[a-zA-Z0-9]{6}$/.test(plan.oldSlug)) stats.cuidStripped++;
    if (/synthse|corrigee|equilibr|physiqu|mathematiq|controle|electriq|magnetiqu|thermiqu|optiqu/.test(plan.oldSlug)) stats.accentRestored++;
    if (plan.oldSlug.includes('.pdf') || /[a-z]pdf/.test(plan.oldSlug)) stats.pdfStripped++;
  }
  if (titleChanged) {
    if (/&amp;|&[a-z]+;|&#\d+;/.test(plan.oldTitle || '')) stats.titleDecoded++;
  }

  if (DRY_RUN) {
    if (processed <= 5) {
      console.log(`[DRY] ${plan.id}`);
      console.log(`  slug: ${plan.oldSlug} → ${plan.newSlug}`);
      console.log(`  title: ${(plan.oldTitle || '').substring(0, 60)} → ${plan.newTitle.substring(0, 60)}`);
    }
    continue;
  }

  try {
    // Update resource
    await p.resource.update({
      where: { id: plan.id },
      data: {
        slug: plan.newSlug,
        title: plan.newTitle,
      }
    });

    // Record redirect if slug changed
    if (slugChanged) {
      await p.resourceSlugRedirect.create({
        data: {
          oldSlug: plan.oldSlug,
          newSlug: plan.newSlug,
          resourceId: plan.id,
        }
      });
    }
  } catch (e) {
    console.error(`Error updating ${plan.id}: ${e.message}`);
    stats.errors++;
  }

  if (processed % 1000 === 0) {
    console.log(`Processed ${processed}/${all.length}...`);
  }
}

console.log('\n=== Summary ===');
console.log(`Total: ${stats.total}`);
console.log(`  slug changed:      ${stats.slugChanged}`);
console.log(`  title changed:     ${stats.titleChanged}`);
console.log(`  title decoded:     ${stats.titleDecoded}`);
console.log(`  cuid stripped:     ${stats.cuidStripped}`);
console.log(`  accents restored:  ${stats.accentRestored}`);
console.log(`  pdf stripped:      ${stats.pdfStripped}`);
console.log(`  duplicates:        ${stats.duplicatesResolved}`);
console.log(`  errors:            ${stats.errors}`);

if (DRY_RUN) {
  console.log('\n[DRY RUN] No changes were made. Set DRY_RUN=0 to apply.');
}

await p.$disconnect();
