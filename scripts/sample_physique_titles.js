require('dotenv').config({ path: '/workspace/edutunisie/.env.local' });
const { PrismaClient } = require('/workspace/edutunisie/node_modules/@prisma/client');
const p = new PrismaClient({ log: ['error'] });
(async () => {
  // Sample 40 diverse files
  const sample = await p.$queryRaw`
    SELECT r."numericId", r.title, r.type, r."schoolType", r."createdAt",
      c."nameFr" as class_name, c.slug as class_slug,
      s.slug as subject_slug, sec."nameFr" as section_name,
      rm."generalSubject", rm."schoolName", rm."profNames"
    FROM "Resource" r
    JOIN "Class" c ON r."classId" = c.id
    JOIN "Level" l ON c."levelId" = l.id
    JOIN "Subject" s ON r."subjectId" = s.id
    LEFT JOIN "Section" sec ON r."sectionId" = sec.id
    LEFT JOIN "ResourceMetadata" rm ON rm."resourceId" = r.id
    WHERE l.slug = 'lycee' AND s.slug = 'physique' AND r.status = 'PUBLISHED'
    ORDER BY RANDOM()
    LIMIT 40
  `;
  for (const f of sample) {
    console.log(`#${f.numericId} [${f.type}/${f.schoolType}] class=${f.class_slug} sec=${f.section_name || '-'}`);
    console.log(`  Title: ${f.title}`);
    console.log(`  GS: ${f.generalSubject?.substring(0, 50) || '-'} | School: ${f.schoolName || '-'} | Prof: ${JSON.stringify(f.profNames) || '-'}`);
  }
  await p.$disconnect();
})();
