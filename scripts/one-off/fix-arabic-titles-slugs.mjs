/**
 * fix-arabic-titles-slugs.mjs
 *
 * Regenerate slugs for Arabic-titled resources using the ARABIC title itself.
 * (User chose option B: keep Arabic letters in URLs)
 *
 * Strategy:
 * - Strip tashkeel (Arabic diacritics: ً ٌ َ ُ ِ ٍ ْ ّ)
 * - Keep Arabic letters (U+0600-U+06FF)
 * - Keep numbers and dashes
 * - Replace spaces with dashes
 * - Remove problematic URL chars (?#&% etc.)
 * - Add nanoid suffix for uniqueness
 *
 * Example:
 *   title: "فرض تأليفي عدد 2 - التربية الإسلامية - 9 أساسي - 2008-2009 2"
 *   slug:  "فرض-تأليفي-عدد-2-التربية-الإسلامية-9-أساسي-2008-2009-2-AbCdEf"
 */

import { PrismaClient } from '@prisma/client';
import { customAlphabet } from 'nanoid';

const p = new PrismaClient();
const nanoid = customAlphabet('abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', 6);

// Detect if title is mostly Arabic
function isMostlyArabic(text) {
  if (!text) return false;
  const arabicChars = (text.match(/[\u0600-\u06FF]/g) || []).length;
  const latinChars = (text.match(/[a-zA-Z]/g) || []).length;
  return arabicChars > latinChars;
}

// Build an Arabic-friendly slug
function arabicSlug(text, suffix) {
  if (!text) return suffix;
  return text
    // Strip tashkeel (Arabic diacritics): ً ٌ َ ُ ِ ٍ ْ ّ ٰ
    .replace(/[\u064B-\u0652\u0670\u0640]/g, '')
    // Alef normalization (أ إ آ → ا) — cleaner URLs
    .replace(/[أإآٱ]/g, 'ا')
    // Strip Tatweel (kashida) ـ
    .replace(/\u0640/g, '')
    // Remove any character that's NOT: Arabic letter, Latin letter, number, space, dash
    .replace(/[^\u0600-\u06FFa-zA-Z0-9\s\-]/g, ' ')
    // Normalize whitespace (also collapses the ' - ' which becomes '   ')
    .replace(/\s+/g, ' ').trim()
    // Replace spaces with single dashes
    .replace(/ /g, '-')
    // Collapse multiple dashes into one
    .replace(/-+/g, '-')
    // Remove leading/trailing dashes
    .replace(/^-+|-+$/g, '')
    // Limit length (keep room for the suffix)
    .substring(0, 80)
    // If empty (title was all punctuation), fallback to "doc"
    .replace(/^$/, 'doc')
    + '-' + suffix;
}

console.log('=== Find Arabic resources with bad slugs ===');

// Bad slug patterns:
// - Starts with '-'
// - Contains '--' (often from "is" or "an" being stripped)
// - Mostly digits/dashes (regex)
const allResources = await p.resource.findMany({
  where: {
    OR: [
      { slug: { startsWith: '-' } },
      { slug: { contains: '--' } },
    ]
  },
  select: {
    id: true, title: true, slug: true, type: true,
    subject: { select: { slug: true, nameAr: true } },
  },
  take: 2000
});

console.log(`Found ${allResources.length} candidates with bad slugs`);

// Filter to Arabic titles
const arabicResources = allResources.filter(r => isMostlyArabic(r.title));
console.log(`Of which ${arabicResources.length} have Arabic titles → need fix`);

const stats = {
  fixed: 0,
  skipped: 0,
  unchanged: 0,
  errors: [],
};

// Track used slugs to avoid collisions
const usedSlugs = new Set(
  (await p.resource.findMany({ select: { slug: true } })).map(r => r.slug)
);

for (const r of arabicResources) {
  const newSlug = arabicSlug(r.title, nanoid());
  
  if (newSlug === r.slug) {
    stats.unchanged++;
    continue;
  }
  
  if (usedSlugs.has(newSlug)) {
    // Collision — add another nanoid
    const retrySlug = arabicSlug(r.title, nanoid() + nanoid());
    if (usedSlugs.has(retrySlug)) {
      stats.errors.push({ id: r.id, error: 'collision (2 tries)' });
      continue;
    }
    usedSlugs.add(retrySlug);
    try {
      await p.resource.update({
        where: { id: r.id },
        data: { slug: retrySlug }
      });
      stats.fixed++;
    } catch (e) {
      stats.errors.push({ id: r.id, error: e.message });
    }
    continue;
  }
  
  usedSlugs.add(newSlug);
  try {
    await p.resource.update({
      where: { id: r.id },
      data: { slug: newSlug }
    });
    stats.fixed++;
    if (stats.fixed <= 3 || stats.fixed % 50 === 0) {
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

// Now also re-fix the 45 metadata-based slugs (education-islamique-*) if their titles are Arabic
console.log('\n=== Now fixing metadata-based slugs (revert to Arabic) ===');
const metadataBased = await p.resource.findMany({
  where: {
    slug: { contains: 'education-islamique-' },
  },
  select: { id: true, title: true, slug: true },
});
let metadataFixed = 0;
for (const r of metadataBased) {
  if (!isMostlyArabic(r.title)) continue;
  const newSlug = arabicSlug(r.title, nanoid());
  if (newSlug === r.slug) continue;
  if (usedSlugs.has(newSlug)) {
    const retrySlug = arabicSlug(r.title, nanoid() + nanoid());
    if (usedSlugs.has(retrySlug)) continue;
    usedSlugs.add(retrySlug);
    await p.resource.update({ where: { id: r.id }, data: { slug: retrySlug } });
    metadataFixed++;
    continue;
  }
  usedSlugs.add(newSlug);
  await p.resource.update({ where: { id: r.id }, data: { slug: newSlug } });
  metadataFixed++;
}
console.log(`Re-fixed ${metadataFixed} metadata-based slugs`);

await p.$disconnect();
