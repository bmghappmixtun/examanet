/**
 * fix-section-mismatches.mjs
 *
 * Smart section fix: only fix OBVIOUS bugs, skip ambiguous cases.
 *
 * Strategy:
 * 1. 7ème/8ème/9ème should NEVER have a sectionId → clear if set
 * 2. 1AS should NEVER have a sectionId → clear if set
 * 3. 2AS/3AS/4AS: if title clearly has a section keyword that DIFFERENT from DB,
 *    update DB. Otherwise, leave alone (don't risk false positive).
 *
 * High-confidence section detection (no false positives):
 * - "Toutes Sections" / "Toutes les sections" → leave sectionId as-is (ambiguous)
 * - "Lycée pilote" → don't infer section
 * - "Sciences" alone (without "exp") → "sciences" for 2AS, ambiguous for 3AS/4AS
 * - "Sc.exp" / "Sciences exp" / "Sciences expérimentales" → "sciences-experimentales"
 * - "Mathématiques" / "Math" (as section) → "maths"
 * - "Lettres" → "lettres"
 * - "Eco-Gestion" / "Économie et Gestion" → "eco-gestion" (or "eco-services" for 2AS)
 * - "Technique" / "Sciences Techniques" → "technique"
 * - "TI" / "Technologies de l'informatique" → "technologies-informatique" (2AS only)
 * - "Sport" → "sport"
 * - "Informatique" / "SI" / "Sciences de l'informatique" → "sciences-informatique"
 */

import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();

const all = await p.resource.findMany({
  where: { status: 'PUBLISHED' },
  include: {
    class: { select: { slug: true } },
    section: { select: { slug: true, nameFr: true } },
  }
});

console.log(`Loaded ${all.length} resources`);

const stats = {
  clearedSectionForNoSectionClass: 0,
  fixedSectionForLycee: 0,
  ambiguous: 0,
  unchanged: 0,
  errors: [],
};

let batch = [];
const BATCH_SIZE = 100;

for (const r of all) {
  if (!r.class) continue;

  const classSlug = r.class.slug;
  const currentSectionSlug = r.section?.slug || null;
  const title = (r.title || '').toLowerCase();

  // CASE 1: 7ème/8ème/9ème/1AS should NEVER have a section
  if (['7eme', '8eme', '9eme', '1ere-secondaire'].includes(classSlug)) {
    if (currentSectionSlug !== null) {
      stats.clearedSectionForNoSectionClass++;
      batch.push(p.resource.update({
        where: { id: r.id },
        data: { sectionId: null }
      }));
    } else {
      stats.unchanged++;
    }
    if (batch.length >= BATCH_SIZE) { await Promise.all(batch); batch = []; }
    continue;
  }

  // CASE 2: 2AS/3AS/4AS — detect section from title
  // Look for HIGH-CONFIDENCE section keywords
  let detectedSection = null;
  let ambiguous = false;

  // Check ambiguous patterns first
  if (/toutes\s*les?\s*section|كل\s*الفروع/.test(title)) {
    // "Toutes Sections" = all sections — don't infer
    ambiguous = true;
  }

  if (!ambiguous) {
    // 3AS/4AS specific sections
    if (/sc\.?\s*exp|sciences?\s*exp[ée]rimentales|علوم\s*تجريبية/.test(title)) {
      detectedSection = 'sciences-experimentales';
    } else if (/sc\.?\s*inf|sciences?\s*informatique|علوم\s*الإعلامية/.test(title)) {
      detectedSection = 'sciences-informatique';
    } else if (/\bsciences?\s*techniques?\b/.test(title) || /technique\b/.test(title)) {
      detectedSection = 'technique';
    } else if (/\b(4\s*ème\s*)?math(ématiques)?\b/.test(title) && !/sciences?\s*exp/.test(title) && !/\bmath\s*exp/.test(title)) {
      detectedSection = 'maths';
    } else if (/\blettres?\b|\b[ad]ab\b/.test(title)) {
      detectedSection = 'lettres';
    } else if (/\b[ée]co[ -]?gestion\b|eco-gestion|\b[ée]conomie\s*et\s*gestion/.test(title)) {
      detectedSection = 'eco-gestion';
    } else if (/\b[ée]conomie\s*et\s*services?\b|eco-services/.test(title)) {
      detectedSection = 'eco-services';  // 2AS only
    } else if (/\bti\b|technologies?\s*informatiques?/.test(title)) {
      detectedSection = 'technologies-informatique';
    } else if (/\bsport\b|رياضة/.test(title)) {
      detectedSection = 'sport';
    } else if (/\bmath\b/.test(title) && /sc\.?\s*inf|si\b|sciences?\s*informatique/.test(title)) {
      // 3AS Maths + Info = special
      detectedSection = 'sciences-informatique';
    } else if (/\bsciences?\b/.test(title) && classSlug === '2eme-secondaire') {
      // 2AS: "Sciences" → "sciences"
      detectedSection = 'sciences';
    } else if (/lyc[ée]e\s*pilote|coll[èe]ge\s*pilote|\bpilote\b/.test(title)) {
      // Pilot schools — don't infer section
      ambiguous = true;
    }
  }

  if (ambiguous) {
    stats.ambiguous++;
    continue;
  }

  if (!detectedSection) {
    stats.unchanged++;
    continue;
  }

  if (currentSectionSlug === detectedSection) {
    stats.unchanged++;
    continue;
  }

  // Fix the section
  const newSection = await p.section.findFirst({
    where: { classId: r.classId, slug: detectedSection }
  });
  if (!newSection) {
    stats.errors.push({ id: r.id, error: `Section ${detectedSection} not found for class ${classSlug}` });
    continue;
  }

  stats.fixedSectionForLycee++;
  batch.push(p.resource.update({
    where: { id: r.id },
    data: { sectionId: newSection.id }
  }));

  if (batch.length >= BATCH_SIZE) { await Promise.all(batch); batch = []; }
}

if (batch.length > 0) {
  await Promise.all(batch);
}

console.log('\n=== Summary ===');
console.log(JSON.stringify(stats, null, 2));

await p.$disconnect();
