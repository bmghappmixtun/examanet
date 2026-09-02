require('dotenv').config({ path: '/workspace/edutunisie/.env.local' });
const { PrismaClient } = require('/workspace/edutunisie/node_modules/@prisma/client');
const p = new PrismaClient({ log: ['error'] });
(async () => {
  // Get one file with generic + one without
  const genericFile = await p.$queryRaw`
    SELECT r."numericId", r.title, r."fileKey", 
      rm."generalSubject", rm."topics", rm."keyPoints", rm."shortKeyPoints", rm."keyInsights", rm."modelUsed"
    FROM "ResourceMetadata" rm
    JOIN "Resource" r ON r.id = rm."resourceId"
    WHERE r.status = 'PUBLISHED' AND r."subjectId" IN (SELECT id FROM "Subject" WHERE slug = 'physique')
      AND rm."generalSubject" = 'Physique et Chimie'
    LIMIT 3
  `;
  for (const f of genericFile) {
    console.log(`#${f.numericId} [${f.modelUsed}]:`);
    console.log(`  Title: ${f.title.substring(0, 100)}`);
    console.log(`  generalSubject: ${f.generalSubject}`);
    console.log(`  topics: ${JSON.stringify(f.topics)}`);
    console.log(`  keyPoints: ${JSON.stringify(f.keyPoints?.slice(0, 3))}`);
    console.log(`  shortKeyPoints: ${JSON.stringify(f.shortKeyPoints?.slice(0, 3))}`);
    console.log(`  keyInsights: ${JSON.stringify(f.keyInsights?.slice(0, 2))}`);
  }
  
  console.log('\n=== ResourceMetadata schema ===');
  const cols = await p.$queryRaw`
    SELECT column_name, data_type FROM information_schema.columns 
    WHERE table_name = 'ResourceMetadata' 
    ORDER BY ordinal_position
  `;
  for (const c of cols) {
    console.log(`  ${c.column_name}: ${c.data_type}`);
  }
  
  await p.$disconnect();
})();
