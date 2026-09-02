require('dotenv').config({ path: '/workspace/edutinisie/.env.local' });
require('dotenv').config({ path: '/workspace/edutunisie/.env.local' });
const { PrismaClient } = require('/workspace/edutunisie/node_modules/@prisma/client');
const p = new PrismaClient({ log: ['error'] });
(async () => {
  // Get all collège files
  const allCollege = await p.$queryRaw`
    SELECT r.id, r."numericId", r.title, r."subjectId",
      c."nameFr" as class_name, s.slug as subject_slug
    FROM "Resource" r
    JOIN "Class" c ON r."classId" = c.id
    JOIN "Level" l ON c."levelId" = l.id
    JOIN "Subject" s ON r."subjectId" = s.id
    WHERE r.status = 'PUBLISHED' AND l.slug = 'college'
  `;
  
  console.log(`Total collège files: ${allCollege.length}`);
  
  // Detect anomalies
  const anomalies = [];
  for (const f of allCollege) {
    const title = f.title.toLowerCase();
    // If subject=physique but title mentions math (without mentioning physique)
    if (f.subject_slug === 'physique') {
      if (/\bmath(ematiques|en)?\b/.test(title) && !/\bphysique\b/.test(title) && !/sciences?\s+physiques?\b/.test(title)) {
        anomalies.push({ ...f, issue: 'physique_subject_but_math_title' });
      }
    }
    if (f.subject_slug === 'mathematiques') {
      if (/\bphysique\b/.test(title) && !/\bmath(ematiques|en)?\b/.test(title)) {
        anomalies.push({ ...f, issue: 'math_subject_but_physique_title' });
      }
    }
    // Class name says 7ème/8ème/9ème but title might claim other
    if (f.class_name?.includes('7ème') || f.class_name?.includes('8ème') || f.class_name?.includes('9ème')) {
      // nothing more
    }
  }
  
  console.log(`\n=== ANOMALIES IN COLLÈGE: ${anomalies.length} ===`);
  for (const a of anomalies.slice(0, 20)) {
    console.log(`  #${a.numericId} [${a.issue}]: ${a.title.substring(0, 80)}`);
    console.log(`    DB: subject=${a.subject_slug}, class=${a.class_name}`);
  }
  if (anomalies.length > 20) console.log(`... and ${anomalies.length - 20} more`);
  
  await p.$disconnect();
})();
