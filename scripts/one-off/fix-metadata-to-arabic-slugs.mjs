/**
 * fix-metadata-to-arabic-slugs.mjs
 *
 * Convert remaining metadata-based slugs (e.g. "education-islamique-9eme-2008-2009-1-XXX")
 * back to Arabic-based slugs.
 *
 * Pattern to detect: any slug that doesn't contain Arabic letters but title IS mostly Arabic.
 * These are resources from the metadata-based fix that I should now convert.
 */

import { PrismaClient } from '@prisma/client';
import { customAlphabet } from 'nanoid';

const p = new PrismaClient();
const nanoid = customAlphabet('abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', 6);

function isMostlyArabic(text) {
  if (!text) return false;
  const arabicChars = (text.match(/[\u0600-\u06FF]/g) || []).length;
  const latinChars = (text.match(/[a-zA-Z]/g) || []).length;
  return arabicChars > latinChars;
}

function arabicSlug(text, suffix) {
  if (!text) return suffix;
  return text
    .toLowerCase()  // Lowercase BEFORE any processing (handles bilingual FR+AR titles)
    .replace(/[\u064B-\u0652\u0670\u0640]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/\u0640/g, '')
    .replace(/[^\u0600-\u06FFa-zA-Z0-9\s\-]/g, ' ')
    .replace(/\s+/g, ' ').trim()
    .replace(/ /g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 80)
    .replace(/^$/, 'doc')
    + '-' + suffix;
}

console.log('=== Find resources with Arabic title but Latin/Metadata slug ===');

// Find all resources with Arabic titles — we'll re-slug all of them
const arabic = await p.resource.findMany({
  where: {
    title: { not: '' },
  },
  select: { id: true, title: true, slug: true },
});

const toFix = arabic.filter(r => {
  if (!isMostlyArabic(r.title)) return false;
  // Slug doesn't contain Arabic letters → needs fix
  return !/[\u0600-\u06FF]/.test(r.slug);
});

console.log(`Resources with Arabic title but non-Arabic slug: ${toFix.length}`);

const stats = { fixed: 0, unchanged: 0, errors: [] };
const usedSlugs = new Set(
  (await p.resource.findMany({ select: { slug: true } })).map(r => r.slug)
);

for (const r of toFix) {
  const newSlug = arabicSlug(r.title, nanoid());
  if (newSlug === r.slug) {
    stats.unchanged++;
    continue;
  }
  if (usedSlugs.has(newSlug)) {
    const retry = arabicSlug(r.title, nanoid() + nanoid());
    if (usedSlugs.has(retry)) {
      stats.errors.push({ id: r.id, error: 'collision' });
      continue;
    }
    usedSlugs.add(retry);
    try {
      await p.resource.update({ where: { id: r.id }, data: { slug: retry } });
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
    if (stats.fixed <= 3 || stats.fixed % 100 === 0) {
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
