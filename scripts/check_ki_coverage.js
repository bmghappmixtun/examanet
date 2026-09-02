require('dotenv').config({ path: '/workspace/edutunisie/.env.local' });
const { PrismaClient } = require('/workspace/edutunisie/node_modules/@prisma/client');
const p = new PrismaClient({ log: ['error'] });
(async () => {
  const byType = await p.$queryRaw`
    SELECT r.type::text as type,
      COUNT(*)::int as total,
      COUNT(rm."keyInsights") FILTER (WHERE array_length(rm."keyInsights", 1) > 0)::int as with_ki,
      COUNT(*) FILTER (WHERE rm."keyInsights" IS NULL OR array_length(rm."keyInsights", 1) = 0)::int as without_ki
    FROM "Resource" r
    LEFT JOIN "ResourceMetadata" rm ON rm."resourceId" = r.id
    JOIN "Class" c ON r."classId" = c.id
    JOIN "Level" l ON c."levelId" = l.id
    JOIN "Subject" s ON r."subjectId" = s.id
    WHERE l.slug = 'lycee' AND s.slug = 'physique' AND r.status = 'PUBLISHED'
    GROUP BY r.type
    ORDER BY total DESC
  `;
  console.log('=== Physique lycée: keyInsights coverage by type ===');
  console.log('Type         | Total | With KI | Without KI | Coverage');
  console.log('-------------|-------|---------|------------|----------');
  let totalAll = 0, withAll = 0;
  for (const x of byType) {
    const pct = ((x.with_ki / x.total) * 100).toFixed(1);
    console.log(`${x.type.padEnd(12)} | ${String(x.total).padStart(5)} | ${String(x.with_ki).padStart(7)} | ${String(x.without_ki).padStart(10)} | ${pct}%`);
    totalAll += x.total;
    withAll += x.with_ki;
  }
  console.log('-------------|-------|---------|------------|----------');
  console.log(`TOTAL         | ${String(totalAll).padStart(5)} | ${String(withAll).padStart(7)} | ${String(totalAll - withAll).padStart(10)} | ${((withAll/totalAll)*100).toFixed(1)}%`);
  
  const noKI = await p.$queryRaw`
    SELECT r."numericId"::int as numericId, r.title, r.type::text as type,
      cnt."pageCount"::int as pages,
      rm."modelUsed"::text as modelUsed
    FROM "Resource" r
    LEFT JOIN "ResourceMetadata" rm ON rm."resourceId" = r.id
    LEFT JOIN "ResourceContent" cnt ON cnt."resourceId" = r.id
    JOIN "Class" c ON r."classId" = c.id
    JOIN "Level" l ON c."levelId" = l.id
    JOIN "Subject" s ON r."subjectId" = s.id
    WHERE l.slug = 'lycee' AND s.slug = 'physique' AND r.status = 'PUBLISHED'
      AND (rm."keyInsights" IS NULL OR array_length(rm."keyInsights", 1) = 0)
      AND r.type != 'COURSE'
    ORDER BY cnt."pageCount" DESC NULLS LAST
    LIMIT 30
  `;
  console.log(`\n=== Non-COURS files WITHOUT keyInsights (top 30 by page count) ===`);
  for (const f of noKI) {
    console.log(`  #${f.numericId} [${f.type}] pages=${f.pages || '?'} [${(f.modelUsed || 'no model').substring(0, 25)}]: ${f.title.substring(0, 60)}`);
  }
  
  const totalNoKI = await p.$queryRaw`
    SELECT COUNT(*)::int as total
    FROM "Resource" r
    LEFT JOIN "ResourceMetadata" rm ON rm."resourceId" = r.id
    JOIN "Class" c ON r."classId" = c.id
    JOIN "Level" l ON c."levelId" = l.id
    JOIN "Subject" s ON r."subjectId" = s.id
    WHERE l.slug = 'lycee' AND s.slug = 'physique' AND r.status = 'PUBLISHED'
      AND (rm."keyInsights" IS NULL OR array_length(rm."keyInsights", 1) = 0)
      AND r.type != 'COURSE'
  `;
  console.log(`\nTotal non-COURS files without keyInsights: ${totalNoKI[0].total}`);
  
  await p.$disconnect();
})();
