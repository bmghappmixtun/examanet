/**
 * fix-section-naming.mjs
 *
 * Fix section names in DB to match official Tunisian curriculum:
 * - 2AS "Sciences" → stays as "Sciences" (correct per curriculum)
 * - 3AS "Sciences" → "Sciences Expérimentales" (Bac official name)
 * - 4AS "Sciences" → "Sciences Expérimentales" (Bac official name)
 *
 * The application code (src/lib/teacher-workflow-data.ts) already had
 * "Sciences Expérimentales" for 3AS/4AS but the DB had generic "Sciences"
 * due to a buggy seed (src/app/api/admin/seed/route.ts line 61).
 */

import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();

console.log('=== Renaming 3AS "Sciences" → "Sciences Expérimentales" ===');
const r3 = await p.section.update({
  where: { id: 'cmqi8nr22001i2n4a9vf2nvnh' },
  data: {
    slug: 'sciences-experimentales',
    nameFr: 'Sciences Expérimentales',
    nameAr: 'علوم تجريبية',
  }
});
console.log('✅ 3AS:', JSON.stringify(r3, null, 2));

console.log('\n=== Renaming 4AS "Sciences" → "Bac Sciences Expérimentales" (Bac prefix per teacher-workflow-data.ts) ===');
const r4 = await p.section.update({
  where: { id: 'cmqi8nr2j001u2n4aum0hjyac' },
  data: {
    slug: 'sciences-experimentales',
    nameFr: 'Bac Sciences Expérimentales',
    nameAr: 'باك علوم تجريبية',
  }
});
console.log('✅ 4AS:', JSON.stringify(r4, null, 2));

console.log('\n=== Verify ===');
const verify = await p.section.findMany({
  where: {
    OR: [
      { class: { slug: '2eme-secondaire' } },
      { class: { slug: '3eme-secondaire' } },
      { class: { slug: '4eme-secondaire' } },
    ]
  },
  include: { class: { select: { slug: true, nameFr: true } } },
  orderBy: [{ class: { slug: 'asc' } }, { slug: 'asc' }]
});
for (const s of verify) {
  console.log(`  ${s.class.slug.padEnd(20)} | ${s.slug.padEnd(30)} | ${s.nameFr.padEnd(30)} | ${s.nameAr}`);
}

await p.$disconnect();
