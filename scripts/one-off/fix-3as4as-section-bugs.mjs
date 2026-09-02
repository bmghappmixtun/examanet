/**
 * fix-3as4as-section-bugs.mjs
 *
 * Fix the 8 clear section bugs in 3AS/4AS where title has a clear section indicator
 * that doesn't match DB.
 *
 * Cases:
 * - "Bac TI" / "Bac Sport" / "Bac eco-gestion" / "Bac Eco-Gestion"
 * - Section in DB is "maths" or "sciences-informatique" wrongly
 */

import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();

const all = await p.resource.findMany({
  where: { 
    status: 'PUBLISHED', 
    class: { slug: { in: ['3eme-secondaire', '4eme-secondaire'] } }
  },
  include: { section: true, class: true }
});

const sectionMap = {};
const sections = await p.section.findMany();
for (const s of sections) sectionMap[s.classId + ':' + s.slug] = s.id;

let fixed = 0;
for (const r of all) {
  const t = (r.title || '').toLowerCase();
  const currentSlug = r.section?.slug;
  let target = null;

  if (/(?:bac|3[èe]me|4[èe]me)\s+sport\b/.test(t) && currentSlug !== 'sport') {
    target = sectionMap[r.classId + ':sport'];
  }
  else if (/\bbac\s+ti\b/.test(t) && currentSlug !== 'technologies-informatique') {
    target = sectionMap[r.classId + ':technologies-informatique'];
  }
  else if (/(?:bac|3[èe]me|4[èe]me)\s*[ée]co[ -]?gestion\b|\bbac\s*[ée]conomie\s*et\s*gestion/.test(t) && currentSlug !== 'eco-gestion') {
    target = sectionMap[r.classId + ':eco-gestion'];
  }
  else if (/\bbac\s+lettres?\b/.test(t) && currentSlug !== 'lettres') {
    target = sectionMap[r.classId + ':lettres'];
  }
  else if (/\bbac\s+technique\b/.test(t) && currentSlug !== 'technique') {
    target = sectionMap[r.classId + ':technique'];
  }

  if (target) {
    await p.resource.update({
      where: { id: r.id },
      data: { sectionId: target }
    });
    fixed++;
    console.log(`  [${r.class.slug}] ${r.title.substring(0, 70)}`);
  }
}

console.log(`\nFixed: ${fixed}`);
await p.$disconnect();
