/**
 * fix-resource-type-and-slug.mjs
 *
 * One-off fix for:
 * 1. Resources with type='HOMEWORK' but title starts with "Série d'exercices"
 *    (should be type='EXERCISE')
 * 2. All resources with type='EXERCISES' (plural) should be 'EXERCISE' (singular)
 * 3. Regenerate slugs that lost characters due to the buggy slugify
 *    (e.g. 'srie-dexercices' → 'serie-dexercices')
 *
 * SAFE: only updates records that match the criteria.
 * Keeps old slug in 'oldSlugs' log for reference.
 */

import { PrismaClient } from '@prisma/client';
import { customAlphabet } from 'nanoid';

const p = new PrismaClient();

// Replicate the FIXED slugify (same as tunisiecollege-import/route.ts now)
function slugify(text, suffix) {
  return text
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[àáâãäå]/g, 'a').replace(/[èéêë]/g, 'e').replace(/[ìíîï]/g, 'i')
    .replace(/[òóôõö]/g, 'o').replace(/[ùúûü]/g, 'u').replace(/[ç]/g, 'c')
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 60) + '-' + suffix;
}

const nanoid = customAlphabet('abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', 6);

const stats = {
  typeFixedHomeworkToExercise: 0,
  typeFixedPluralToSingular: 0,
  slugFixed: 0,
  errors: [],
};

console.log('=== FIX 1: HOMEWORK → EXERCISE (when title starts with "Série d\'exercices") ===');
const homeworkWithSerieTitle = await p.resource.findMany({
  where: {
    type: 'HOMEWORK',
    title: { startsWith: 'Série' }
  },
  select: { id: true, title: true, slug: true, type: true }
});
console.log(`Found ${homeworkWithSerieTitle.length} resources with type=HOMEWORK but title starts with "Série"`);

for (const r of homeworkWithSerieTitle) {
  if (!/s[ée]rie d['\u2019]exercices?/i.test(r.title)) {
    // Title starts with "Série" but isn't actually a series of exercises — skip
    continue;
  }
  try {
    await p.resource.update({
      where: { id: r.id },
      data: { type: 'EXERCISE' }
    });
    stats.typeFixedHomeworkToExercise++;
    console.log(`  ✅ ${r.id} → EXERCISE: ${r.title.substring(0, 60)}...`);
  } catch (e) {
    stats.errors.push({ id: r.id, error: e.message });
  }
}

console.log('\n=== FIX 2: EXERCISES (plural) → EXERCISE (singular) ===');
const pluralCount = await p.resource.count({ where: { type: 'EXERCISES' } });
console.log(`Found ${pluralCount} resources with type='EXERCISES'`);
if (pluralCount > 0) {
  const result = await p.resource.updateMany({
    where: { type: 'EXERCISES' },
    data: { type: 'EXERCISE' }
  });
  stats.typeFixedPluralToSingular = result.count;
  console.log(`  ✅ Updated ${result.count} resources to type='EXERCISE'`);
}

console.log('\n=== FIX 3: Regenerate slugs that lost characters ===');
// A "broken" slug is one that:
// - has words starting with consonants followed by vowels that look like they
//   should have been 'e' (e.g. "srie" should be "serie")
// - we can detect: "srie" "trie" "drie" "mrie" — common "lost-e" patterns
// The safest approach: regenerate ALL slugs that look suspicious
// (start with one of the known-broken prefixes)
const brokenPrefixes = ['srie', 'trie', 'drie', 'mrie', 'frie', 'prie', 'crie', 'nrie', 'lrie', 'vrie', 'hrie'];
const suspiciousResources = await p.resource.findMany({
  where: {
    OR: brokenPrefixes.map(prefix => ({ slug: { startsWith: prefix + '-' } }))
  },
  select: { id: true, title: true, slug: true }
});
console.log(`Found ${suspiciousResources.length} resources with suspicious slugs (missing 'e' from 'série' etc.)`);

for (const r of suspiciousResources) {
  try {
    const newSlug = slugify(r.title, nanoid());
    if (newSlug !== r.slug) {
      await p.resource.update({
        where: { id: r.id },
        data: { slug: newSlug }
      });
      stats.slugFixed++;
      console.log(`  ✅ ${r.id}`);
      console.log(`     old: ${r.slug}`);
      console.log(`     new: ${newSlug}`);
    }
  } catch (e) {
    stats.errors.push({ id: r.id, error: e.message });
  }
}

console.log('\n=== Summary ===');
console.log(JSON.stringify(stats, null, 2));

await p.$disconnect();
