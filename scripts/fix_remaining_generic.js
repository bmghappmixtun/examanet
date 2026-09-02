require('dotenv').config({ path: '/workspace/edutunisie/.env.local' });
const { PrismaClient } = require('/workspace/edutunisie/node_modules/@prisma/client');
const p = new PrismaClient({ log: ['error'] });
(async () => {
  // Find files with single-word or very generic generalSubject
  const candidates = await p.$queryRaw`
    SELECT rm.id, r."numericId", rm."generalSubject", rm.topics,
      c."nameFr" as class_name, sec."nameFr" as section_name
    FROM "ResourceMetadata" rm
    JOIN "Resource" r ON r.id = rm."resourceId"
    JOIN "Class" c ON r."classId" = c.id
    LEFT JOIN "Section" sec ON r."sectionId" = sec.id
    WHERE r.status = 'PUBLISHED' AND r."subjectId" IN (SELECT id FROM "Subject" WHERE slug = 'physique')
      AND (
        rm."generalSubject" IN ('Éducation', 'Physique', 'Chimie', 'Lycée', 'Tunisie', 'Tunisien', 'Sciences physiques et chimiques')
        OR LENGTH(rm."generalSubject") < 10
      )
  `;
  console.log(`Found ${candidates.length} files with very generic generalSubject`);
  
  // Use class + section as fallback
  const updated = [];
  for (const f of candidates) {
    // Build a smart fallback based on section/class
    let fallback = '';
    if (f.section_name) {
      fallback = `${f.class_name} - ${f.section_name}`;
    } else {
      fallback = f.class_name;
    }
    try {
      await p.resourceMetadata.update({ where: { id: f.id }, data: { generalSubject: fallback } });
      updated.push({ id: f.id, numericId: f.numericId, newGs: fallback });
    } catch (e) { console.error(`  FAIL #${f.numericId}: ${e.message}`); }
  }
  console.log(`Updated ${updated.length} files`);
  for (const u of updated.slice(0, 5)) {
    console.log(`  #${u.numericId}: → "${u.newGs}"`);
  }
  await p.$disconnect();
})();
