#!/usr/bin/env node
/**
 * Fix langue (language) field for arabe lycée files (2026-08-19)
 *
 * User feedback 2026-08-19: 'verifie s'il y a des fichier en langue fr
 * ici [arabe lycée]'
 *
 * Found 18 arabe lycée files where Resource.language was 'fr' but the
 * actual content is in Arabic (titles, descriptions, metadata all in
 * Arabic — 'العربية' as subject, 'نص أدبي' as generalSubject, etc.).
 *
 * Fixed all 18: language 'fr' → 'ar' to match the actual content.
 */
import { PrismaClient } from '@prisma/client';
const p = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL } }
});
(async () => {
  const frArabe = await p.resource.findMany({
    where: { 
      subject: { slug: 'arabe' },
      class: { slug: { in: ['1ere-secondaire', '2eme-secondaire', '3eme-secondaire', '4eme-secondaire'] } },
      language: 'fr',
      status: 'PUBLISHED',
    },
    select: { id: true, numericId: true }
  });
  console.log('Found ' + frArabe.length + ' arabe lycée files with language=fr');
  for (const r of frArabe) {
    await p.resource.update({ where: { id: r.id }, data: { language: 'ar' } });
    console.log('  ✅ #' + r.numericId);
  }
  await p.$disconnect();
})();
