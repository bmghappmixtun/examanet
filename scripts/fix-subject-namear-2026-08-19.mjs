#!/usr/bin/env node
/**
 * Subject nameAr corrections (2026-08-19)
 *
 * Per user: 'la matière etude de texte en arabe lycée doit être
 * "étude de texte Arabe"' — the français subject's Arabic name
 * should be 'دراسة النص العربية' (étude de texte Arabe), not
 * just 'الفرنسية' (French).
 */
import { PrismaClient } from '@prisma/client';
const p = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL } }
});
(async () => {
  // français → دراسة النص العربية
  const fr = await p.subject.findFirst({ where: { slug: 'francais' } });
  if (fr) {
    await p.subject.update({
      where: { id: fr.id },
      data: { nameAr: 'دراسة النص العربية' }
    });
    console.log('✅ Subject français nameAr updated');
    console.log(`  ${fr.nameFr} | ${fr.nameAr} → ${'دراسة النص العربية'}`);
  }
  await p.$disconnect();
})();

// 2026-08-19: Also updated titles of 2 recently-reclassified français
// files (#7915 + #3988) — replaced 'الفرنسية' with 'دراسة النص' in
// the title to match the new subject name.
