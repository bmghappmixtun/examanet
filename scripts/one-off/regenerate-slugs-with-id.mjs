/**
 * regenerate-slugs-with-id.mjs
 *
 * One-shot migration to the new URL format /ressources/{numericId}/{slug}.
 *
 * This script:
 *  1. Decodes HTML entities in titles (&amp;amp; → &, &#x27; → ')
 *  2. Regenerates slugs without cuid suffix and with proper accent transliteration
 *  3. Records the old slug in ResourceSlugRedirect table
 *  4. Updates the resource with the new clean slug
 *
 * After this:
 *  - Resources are still findable by the OLD slug (via ResourceSlugRedirect)
 *  - The new URL is /ressources/{numericId}/{cleanSlug}
 *  - Lookup in the route handler will be by numericId (the slug is just for SEO)
 */

import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();

const DRY_RUN = process.env.DRY_RUN === '1';

// ============ HELPERS ============

function decodeHtmlEntities(text) {
  if (!text) return '';
  let result = text;
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

function properSlugify(text) {
  if (!text) return '';
  let s = decodeHtmlEntities(text);
  // Strip file extensions
  s = s.replace(/\.pdf$/i, '').replace(/\.docx?$/i, '').replace(/\.odt$/i, '');

  s = s.toLowerCase().trim();
  // NFD: decompose accented chars
  s = s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  // Specific French accent map
  s = s
    .replace(/[àáâãäå]/g, 'a')
    .replace(/[èéêë]/g, 'e')
    .replace(/[ìíîï]/g, 'i')
    .replace(/[òóôõö]/g, 'o')
    .replace(/[ùúûü]/g, 'u')
    .replace(/[ç]/g, 'c')
    .replace(/[ñ]/g, 'n')
    .replace(/[ýÿ]/g, 'y');

  // Keep ASCII a-z, digits, Arabic Unicode (\u0600-\u06FF), hyphens
  s = s.replace(/[^a-z0-9\u0600-\u06FF]+/g, '-');
  s = s.replace(/-+/g, '-');
  s = s.replace(/^-+|-+$/g, '');

  // Truncate to 60 chars at word boundary
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

// ============ MAIN ============

const all = await p.resource.findMany({
  where: { status: 'PUBLISHED', numericId: { not: null } },
  select: { id: true, slug: true, title: true, numericId: true }
});

console.log(`Loaded ${all.length} resources\n`);

const stats = {
  total: 0,
  titleChanged: 0,
  slugChanged: 0,
  redirectsRecorded: 0,
  errors: 0,
};

let processed = 0;

for (const r of all) {
  processed++;
  stats.total++;

  const newTitle = decodeHtmlEntities(r.title || '');
  const newSlug = properSlugify(r.title || '');

  const titleChanged = (r.title || '') !== newTitle;
  const slugChanged = r.slug !== newSlug;

  if (!titleChanged && !slugChanged) continue;

  if (DRY_RUN) {
    if (processed <= 3) {
      console.log(`[DRY] ${r.numericId} | ${r.id}`);
      console.log(`  slug: ${r.slug} → ${newSlug}`);
      console.log(`  title: ${(r.title || '').substring(0, 60)}`);
      console.log(`  → newTitle: ${newTitle.substring(0, 60)}`);
    }
    stats.titleChanged += titleChanged ? 1 : 0;
    stats.slugChanged += slugChanged ? 1 : 0;
    continue;
  }

  try {
    // BATCHED: use raw SQL for speed on 15K rows
    // 1. Update the resource
    await p.$executeRawUnsafe(
      `UPDATE "Resource" SET title = $1, slug = $2 WHERE id = $3`,
      newTitle, newSlug, r.id
    );

    if (slugChanged) {
      // 2. Record redirect via UPSERT (avoids P2002 unique constraint error)
      const newUrl = `/ressources/${r.numericId}/${newSlug}`;
      try {
        await p.resourceSlugRedirect.create({
          data: {
            oldSlug: r.slug,
            newSlug: newUrl,
            resourceId: r.id,
          }
        });
        stats.redirectsRecorded++;
      } catch (e) {
        if (e.code === 'P2002') {
          // Update existing
          await p.resourceSlugRedirect.update({
            where: { oldSlug: r.slug },
            data: { newSlug: newUrl, resourceId: r.id }
          });
          stats.redirectsRecorded++;
        } else {
          throw e;
        }
      }
    }

    stats.titleChanged += titleChanged ? 1 : 0;
    stats.slugChanged += slugChanged ? 1 : 0;
  } catch (e) {
    console.error(`Error on ${r.id}: ${e.message.substring(0, 200)}`);
    stats.errors++;
  }

  if (processed % 1000 === 0) {
    console.log(`Processed ${processed}/${all.length}...`);
  }
}

console.log('\n=== Summary ===');
console.log(`Total: ${stats.total}`);
console.log(`  title changed: ${stats.titleChanged}`);
console.log(`  slug changed:  ${stats.slugChanged}`);
console.log(`  redirects:     ${stats.redirectsRecorded}`);
console.log(`  errors:        ${stats.errors}`);

if (DRY_RUN) console.log('\n[DRY RUN] No changes were made.');

await p.$disconnect();
