/**
 * fix-latin-accent-slugs.mjs
 *
 * Fix 1015 resources with bad slugs (French accents stripped instead of transliterated).
 *
 * The buggy slugify (used in older imports) did:
 *   'Série d\'exercices' → 'srie-d-exercices' (lost 'e' from série)
 *   'Contrôle' → 'contrle' (lost 'e')
 *   'Révision' → 'rvision'
 *   '9ème' → '9me'
 *
 * The fix uses the canonical slugify (transliterate é→e, è→e, ê→e, etc.)
 */

import { PrismaClient } from '@prisma/client';
import { customAlphabet } from 'nanoid';

const p = new PrismaClient();
const nanoid = customAlphabet('abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', 6);

// Canonical slugify (matches src/lib/utils.ts)
function slugify(text, maxLength = 60) {
  return text
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // strip diacritics
    .replace(/[àáâãäå]/g, 'a').replace(/[èéêë]/g, 'e').replace(/[ìíîï]/g, 'i')
    .replace(/[òóôõö]/g, 'o').replace(/[ùúûü]/g, 'u').replace(/[ç]/g, 'c')
    .replace(/[^a-z0-9\s-]/g, '')  // ASCII only
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, maxLength);
}

console.log('=== Find bad slugs (Latin text with accent bug) ===');

const bad = await p.resource.findMany({
  where: {
    OR: [
      { slug: { startsWith: '-' } },
      { slug: { contains: '--' } },
    ]
  },
  select: { id: true, title: true, slug: true, type: true },
  take: 2000
});

console.log(`Found ${bad.length} bad slugs`);

const stats = { fixed: 0, skipped: 0, unchanged: 0, errors: [] };

// Load all existing slugs for collision check
const usedSlugs = new Set(
  (await p.resource.findMany({ select: { slug: true } })).map(r => r.slug)
);

for (const r of bad) {
  if (!r.title) {
    stats.skipped++;
    continue;
  }
  // Re-slugify the title
  const newSlug = slugify(r.title) + '-' + nanoid();
  
  if (newSlug === r.slug) {
    stats.unchanged++;
    continue;
  }
  
  if (usedSlugs.has(newSlug)) {
    // Collision — add more nanoid chars
    const retrySlug = slugify(r.title) + '-' + nanoid() + nanoid();
    if (usedSlugs.has(retrySlug)) {
      stats.errors.push({ id: r.id, error: 'collision' });
      continue;
    }
    usedSlugs.add(retrySlug);
    try {
      await p.resource.update({ where: { id: r.id }, data: { slug: retrySlug } });
      stats.fixed++;
    } catch (e) {
      stats.errors.push({ id: r.id, error: e.message });
    }
    continue;
  }
  
  usedSlugs.add(newSlug);
  try {
    await p.resource.update({ where: { id: r.id }, data: { slug: newSlug } });
    stats.fixed++;
    if (stats.fixed <= 5 || stats.fixed % 100 === 0) {
      console.log(`  ✅ ${r.id}`);
      console.log(`     old: ${r.slug}`);
      console.log(`     new: ${newSlug}`);
      console.log(`     title: ${r.title.substring(0, 50)}`);
    }
  } catch (e) {
    stats.errors.push({ id: r.id, error: e.message });
  }
}

console.log('\n=== Summary ===');
console.log(JSON.stringify(stats, null, 2));

await p.$disconnect();
