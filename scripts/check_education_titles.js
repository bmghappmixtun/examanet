require('dotenv').config({ path: '/workspace/edutunisie/.env.local' });
const { PrismaClient } = require('/workspace/edutunisie/node_modules/@prisma/client');
const p = new PrismaClient({ log: ['error'] });
(async () => {
  const files = await p.$queryRaw`
    SELECT r."numericId", r.title, c."nameFr" as class_name, s."nameFr" as subject_name
    FROM "Resource" r
    JOIN "ResourceMetadata" rm ON rm."resourceId" = r.id
    JOIN "Class" c ON r."classId" = c.id
    JOIN "Subject" s ON r."subjectId" = s.id
    WHERE rm."generalSubject" = 'Éducation'
    LIMIT 5
  `;
  for (const f of files) {
    console.log(`#${f.numericId} [${f.subject_name} ${f.class_name}]:`);
    console.log(`  ${f.title}`);
  }
  await p.$disconnect();
})();
