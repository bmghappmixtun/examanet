require('dotenv').config({ path: '/workspace/edutunisie/.env.local' });
const { PrismaClient } = require('/workspace/edutunisie/node_modules/@prisma/client');
const p = new PrismaClient({ log: ['error'] });
(async () => {
  // Count ONLY lycée files (class.level.slug = 'lycee')
  const subjects = await p.$queryRaw`
    SELECT s.slug, s."nameFr", COUNT(r.id)::int as total
    FROM "Subject" s
    JOIN "Resource" r ON r."subjectId" = s.id AND r.status = 'PUBLISHED'
    JOIN "Class" c ON r."classId" = c.id
    JOIN "Level" l ON c."levelId" = l.id
    WHERE l.slug = 'lycee'
    GROUP BY s.id, s.slug, s."nameFr"
    ORDER BY total DESC
  `;
  
  console.log('=== LYCÉE PAR MATIÈRE (filtré strict) ===');
  let total = 0;
  for (const s of subjects) {
    console.log(`  ${s.slug.padEnd(22)} ${String(s.total).padStart(5)} fichiers`);
    total += s.total;
  }
  console.log(`  ${'TOTAL'.padEnd(22)} ${String(total).padStart(5)} fichiers`);
  
  // AI coverage on lycée files only
  const aiBySubject = await p.$queryRaw`
    SELECT s.slug, 
      COUNT(r.id)::int as total,
      COUNT(rm.id)::int as with_meta,
      COUNT(CASE WHEN rm."generalSubject" IS NOT NULL THEN 1 END)::int as with_gs,
      COUNT(CASE WHEN rm."shortKeyPoints" IS NOT NULL AND cardinality(rm."shortKeyPoints") > 0 THEN 1 END)::int as with_shortkp
    FROM "Subject" s
    JOIN "Resource" r ON r."subjectId" = s.id AND r.status = 'PUBLISHED'
    JOIN "Class" c ON r."classId" = c.id
    JOIN "Level" l ON c."levelId" = l.id
    LEFT JOIN "ResourceMetadata" rm ON rm."resourceId" = r.id
    WHERE l.slug = 'lycee'
    GROUP BY s.id, s.slug
    ORDER BY total DESC
  `;
  console.log('\n=== COUVERTURE AI (lycée strict) ===');
  console.log(`  ${'subject'.padEnd(22)} ${'total'.padStart(5)} ${'meta'.padStart(6)} ${'GS'.padStart(4)} ${'shortKP'.padStart(8)} ${'toProcess'.padStart(11)}`);
  let toProcessTotal = 0;
  for (const s of aiBySubject) {
    const toProcess = s.total - s.with_gs;
    toProcessTotal += toProcess;
    console.log(`  ${s.slug.padEnd(22)} ${String(s.total).padStart(5)} ${String(s.with_meta).padStart(6)} ${String(s.with_gs).padStart(4)} ${String(s.with_shortkp).padStart(8)} ${String(toProcess).padStart(11)}`);
  }
  console.log(`  ${'TOTAL to process'.padEnd(22)} ${' '.repeat(5)} ${' '.repeat(6)} ${' '.repeat(4)} ${' '.repeat(8)} ${String(toProcessTotal).padStart(11)}`);
  
  // Summary by subject group
  console.log('\n=== PRIORITÉ ===');
  const priority = aiBySubject.filter(s => s.total - s.with_gs > 0).sort((a,b) => (b.total - b.with_gs) - (a.total - a.with_gs));
  for (const s of priority.slice(0, 5)) {
    console.log(`  ${s.slug}: ${s.total - s.with_gs} à processer`);
  }
  
  await p.$disconnect();
})();
