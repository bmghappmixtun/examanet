/**
 * fix-section-mismatches-v2.mjs
 *
 * Fix REAL section mismatches. Only operates on cases where:
 * - Title explicitly mentions a section keyword like "Economie", "TI", "Lettres"
 * - DB has a different section for that resource
 *
 * Skip ambiguous cases (subject vs section confusion).
 *
 * Targets:
 * - 2AS: title says "Economie" → "eco-services" (43)
 * - 2AS: title says "TI" → "technologies-informatique" (8)
 * - 2AS: title says "Lettres" → "lettres" (15)
 * - Total: ~66
 */

import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();

// Find all 2AS resources
const all2as = await p.resource.findMany({
  where: { status: 'PUBLISHED', class: { slug: '2eme-secondaire' } },
  include: { section: true }
});

console.log(`Loaded ${all2as.length} 2AS resources`);

// Get section IDs
const ecoSection = await p.section.findFirst({ where: { classId: { in: (await p.class.findMany({ where: { slug: '2eme-secondaire' } })).map(c => c.id) }, slug: 'eco-services' } });
const tiSection = await p.section.findFirst({ where: { classId: { in: (await p.class.findMany({ where: { slug: '2eme-secondaire' } })).map(c => c.id) }, slug: 'technologies-informatique' } });
const lettresSection = await p.section.findFirst({ where: { classId: { in: (await p.class.findMany({ where: { slug: '2eme-secondaire' } })).map(c => c.id) }, slug: 'lettres' } });

console.log(`Sections: eco=${ecoSection?.id}, ti=${tiSection?.id}, lettres=${lettresSection?.id}`);

let batch = [];
let count = { eco: 0, ti: 0, lettres: 0 };

for (const r of all2as) {
  const t = (r.title || '').toLowerCase();
  const currentSlug = r.section?.slug;
  let target = null;

  // Decoding HTML entities (&amp; → &)
  const tDecoded = t.replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ');

  // Check for "Economie" keyword (covers "Economie et Services", "Eco Services", "Economia")
  if (/[ée]conomie|eco[ -]?services?|\becon[oó]mica\b/.test(tDecoded) && currentSlug !== 'eco-services' && ecoSection) {
    target = ecoSection;
    count.eco++;
  }
  // Check for "TI" keyword (Technologies de l'informatique) - 2AS only
  // IMPORTANT: skip if the title has "Sc + TI" (combined section, not pure TI)
  else if (/\bti\b|technologies?\s*informatiques?/.test(tDecoded) && !/sc\s*\+\s*ti|sc\s*ti/.test(tDecoded) && currentSlug !== 'technologies-informatique' && tiSection) {
    target = tiSection;
    count.ti++;
  }
  // Check for "Lettres" keyword
  else if (/\blettres?\b|\b[ad]ab\b/.test(tDecoded) && currentSlug !== 'lettres' && lettresSection) {
    target = lettresSection;
    count.lettres++;
  }

  if (target) {
    batch.push(p.resource.update({
      where: { id: r.id },
      data: { sectionId: target.id }
    }));
  }
}

console.log(`\nWill update: ${count.eco} eco, ${count.ti} ti, ${count.lettres} lettres = ${batch.length} total`);

if (batch.length > 0) {
  await Promise.all(batch);
  console.log('All updates done');
}

await p.$disconnect();
