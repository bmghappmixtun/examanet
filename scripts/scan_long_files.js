require('dotenv').config({ path: '/workspace/edutunisie/.env.local' });
const { PrismaClient } = require('/workspace/edutunisie/node_modules/@prisma/client');
const p = new PrismaClient({ log: ['error'] });
(async () => {
  // Long files with current keyInsights count
  const stats = await p.$queryRaw`
    SELECT 
      CASE 
        WHEN cnt."pageCount" >= 60 THEN '60+ pages'
        WHEN cnt."pageCount" >= 30 THEN '30-59 pages'
        WHEN cnt."pageCount" >= 15 THEN '15-29 pages'
        ELSE '<15 pages'
      END as bucket,
      COUNT(*) as total,
      COUNT(rm."keyInsights") FILTER (WHERE rm."keyInsights" IS NOT NULL) as with_ki,
      ROUND(AVG(array_length(rm."keyInsights", 1)) FILTER (WHERE rm."keyInsights" IS NOT NULL)) as avg_ki,
      MAX(array_length(rm."keyInsights", 1)) as max_ki
    FROM "Resource" r
    JOIN "ResourceContent" cnt ON cnt."resourceId" = r.id
    LEFT JOIN "ResourceMetadata" rm ON rm."resourceId" = r.id
    WHERE r.status = 'PUBLISHED' 
      AND r."subjectId" IN (SELECT id FROM "Subject" WHERE slug = 'physique')
      AND cnt."pageCount" IS NOT NULL
    GROUP BY bucket
    ORDER BY bucket
  `;
  console.log('=== Physique lycée files by page count ===');
  for (const s of stats) {
    console.log(`  ${s.bucket}: ${s.total} files, avg kI=${s.avg_ki || 0}, max kI=${s.max_ki || 0}`);
  }
  
  // Per-subject breakdown for long files
  console.log('\n=== All subjects: 30+ page files ===');
  const allSubjects = await p.$queryRaw`
    SELECT s.slug as subject, COUNT(*) as total
    FROM "Resource" r
    JOIN "ResourceContent" cnt ON cnt."resourceId" = r.id
    JOIN "Subject" s ON r."subjectId" = s.id
    WHERE r.status = 'PUBLISHED' AND cnt."pageCount" >= 30
    GROUP BY s.slug
    ORDER BY total DESC
  `;
  for (const s of allSubjects) {
    console.log(`  ${s.subject}: ${s.total} files 30+ pages`);
  }
  
  // Sample of long files
  console.log('\n=== Top 10 longest physique lycée files ===');
  const long = await p.$queryRaw`
    SELECT r."numericId", r.title, cnt."pageCount",
      array_length(rm."keyInsights", 1) as ki,
      rm."modelUsed"
    FROM "Resource" r
    JOIN "ResourceContent" cnt ON cnt."resourceId" = r.id
    LEFT JOIN "ResourceMetadata" rm ON rm."resourceId" = r.id
    WHERE r.status = 'PUBLISHED' 
      AND r."subjectId" IN (SELECT id FROM "Subject" WHERE slug = 'physique')
      AND cnt."pageCount" >= 30
    ORDER BY cnt."pageCount" DESC
    LIMIT 10
  `;
  for (const f of long) {
    console.log(`  #${f.numericId} pages=${f.pageCount} kI=${f.ki || 0} [${f.modelUsed?.substring(0, 20) || 'no model'}]: ${f.title.substring(0, 60)}`);
  }
  
  await p.$disconnect();
})();
