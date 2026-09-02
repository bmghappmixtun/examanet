require('dotenv').config({ path: '/workspace/edutunisie/.env.local' });
const { PrismaClient } = require('/workspace/edutunisie/node_modules/@prisma/client');
const p = new PrismaClient({ log: ['error'] });
(async () => {
  const result = await p.$queryRaw`
    SELECT r.id, r."numericId", r.title, r.slug, r.type, r."schoolType", r."subjectId",
      s.slug as subject_slug, s."nameFr" as subject_name,
      c.slug as class_slug, c."nameFr" as class_name, l.slug as level_slug,
      sec."nameFr" as section_name,
      rm."generalSubject", rm."modelUsed", rm."schoolName", rm."profNames"
    FROM "Resource" r
    LEFT JOIN "Subject" s ON r."subjectId" = s.id
    LEFT JOIN "Class" c ON r."classId" = c.id
    LEFT JOIN "Level" l ON c."levelId" = l.id
    LEFT JOIN "Section" sec ON r."sectionId" = sec.id
    LEFT JOIN "ResourceMetadata" rm ON rm."resourceId" = r.id
    WHERE r."numericId" = 515
  `;
  console.log(JSON.stringify(result[0], null, 2));
  await p.$disconnect();
})();
