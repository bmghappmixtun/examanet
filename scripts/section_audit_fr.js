require('dotenv').config({ path: '/workspace/edutunisie/.env.local' });
const { PrismaClient } = require('/workspace/edutunisie/node_modules/@prisma/client');
const p = new PrismaClient({ log: ['error'] });
(async () => {
  // Test #4591 and #7909
  const files = await p.$queryRaw`
    SELECT r."numericId", r.title, r."sectionId",
      c.slug as class_slug, sec."nameFr" as section_name
    FROM "Resource" r
    JOIN "Class" c ON r."classId" = c.id
    JOIN "Level" l ON c."levelId" = l.id
    JOIN "Subject" s ON r."subjectId" = s.id
    LEFT JOIN "Section" sec ON r."sectionId" = sec.id
    WHERE l.slug = 'lycee' AND s.slug IN ('francais', 'physique') AND r.status = 'PUBLISHED' AND r."numericId" IN (4591, 7909, 14027, 15360)
  `;
  for (const f of files) {
    console.log(`#${f.numericId}: ${f.title.substring(0, 80)}`);
    console.log(`  Class: ${f.class_slug}, Section: ${f.section_name || 'NULL'}`);
  }
  await p.$disconnect();
})();
