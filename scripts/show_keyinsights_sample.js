require('dotenv').config({ path: '/workspace/edutunisie/.env.local' });
const { PrismaClient } = require('/workspace/edutunisie/node_modules/@prisma/client');
const p = new PrismaClient({ log: ['error'] });
(async () => {
  // Get 5 files with keyInsights populated
  const files = await p.$queryRaw`
    SELECT r.id, r."numericId", r.title, r.type,
      rm."keyInsights", rm."modelUsed",
      rs.summary
    FROM "Resource" r
    JOIN "Class" c ON r."classId" = c.id
    JOIN "Level" l ON c."levelId" = l.id
    LEFT JOIN "ResourceMetadata" rm ON rm."resourceId" = r.id
    LEFT JOIN "ResourceSummary" rs ON rs."resourceId" = r.id
    WHERE l.slug = 'lycee' 
      AND r."subjectId" = (SELECT id FROM "Subject" WHERE slug = 'physique')
      AND r.status = 'PUBLISHED'
      AND rm."keyInsights" IS NOT NULL 
      AND cardinality(rm."keyInsights") > 0
    ORDER BY r."numericId" ASC
    LIMIT 5
  `;
  
  for (const f of files) {
    console.log(`\n${'='.repeat(70)}`);
    console.log(`  #${f.numericId} (${f.type})`);
    console.log(`  ${f.title.substring(0, 80)}`);
    console.log(`${'='.repeat(70)}`);
    console.log(`\n  📝 Summary (enriched):`);
    console.log(`     ${f.summary?.substring(0, 250) || '∅'}${f.summary?.length > 250 ? '...' : ''}`);
    console.log(`\n  📋 keyInsights (${(f.keyInsights || []).length}):`);
    (f.keyInsights || []).forEach((ki, i) => console.log(`     ${i + 1}. ${ki}`));
  }
  await p.$disconnect();
})();
