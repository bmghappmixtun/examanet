require('dotenv').config({ path: '/workspace/edutunisie/.env.local' });
const { PrismaClient } = require('/workspace/edutunisie/node_modules/@prisma/client');
const p = new PrismaClient({ log: ['error'] });
(async () => {
  // Get prof #1199
  const prof = await p.user.findFirst({ where: { numericId: 1199 } });
  console.log('=== Prof 1199 ===');
  console.log(`Name: ${prof.firstName} ${prof.lastName}`);
  console.log(`AR: ${prof.firstNameAr} ${prof.lastNameAr}`);
  console.log(`Email: ${prof.email}`);
  console.log(`School: ${prof.schoolName}`);
  console.log('');
  
  // Get all his resources
  const profId = prof.id;
  const files = await p.$queryRaw`
    SELECT r."numericId", r.title, r."fileKey", r."subjectId", r."classId", r."sectionId", r.type, r."schoolType",
      s.slug as subject_slug, c.slug as class_slug, sec."nameFr" as section_name,
      rm."generalSubject", rm."modelUsed", rm."topics", rm."keyPoints", rm."keyInsights",
      cnt."pageCount" as page_count
    FROM "Resource" r
    JOIN "Subject" s ON r."subjectId" = s.id
    JOIN "Class" c ON r."classId" = c.id
    LEFT JOIN "Section" sec ON r."sectionId" = sec.id
    LEFT JOIN "ResourceMetadata" rm ON rm."resourceId" = r.id
    LEFT JOIN "ResourceContent" cnt ON cnt."resourceId" = r.id
    WHERE r."teacherId" = ${profId}
    ORDER BY r."numericId" ASC
  `;
  console.log(`Total files by prof 1199: ${files.length}`);
  for (const f of files) {
    console.log(`  #${f.numericId} [${f.type}] ${f.subject_slug} ${f.class_slug} ${f.section_name || '-'} pages=${f.page_count || '?'}: ${f.title.substring(0, 90)}`);
    console.log(`    generalSubject: ${f.generalSubject?.substring(0, 60)}`);
    console.log(`    modelUsed: ${f.modelUsed}`);
    console.log(`    topics: ${JSON.stringify(f.topics?.slice(0, 3))}`);
    console.log(`    keyInsights count: ${f.keyInsights?.length || 0}`);
  }
  await p.$disconnect();
})();
