require('dotenv').config({ path: '/workspace/edutunisie/.env.local' });
const { PrismaClient } = require('/workspace/edutunisie/node_modules/@prisma/client');
const p = new PrismaClient({ log: ['error'] });
(async () => {
  // Find math files processed by our new reprocess that have the old AI summary
  const files = await p.$queryRaw`
    SELECT r.id, r."numericId", r.title, r.description,
      rm."generalSubject", rm."schoolName", rm."profNames"
    FROM "Resource" r
    JOIN "ResourceMetadata" rm ON rm."resourceId" = r.id
    WHERE r."subjectId" IN (SELECT id FROM "Subject" WHERE slug = 'mathematiques')
      AND rm."modelUsed" = 'gpt-4o-mini-reprocess-mathematiques-v1'
      AND r.status = 'PUBLISHED'
  `;
  console.log(`Files to update: ${files.length}`);
  
  // For each, build a clean description
  let success = 0;
  for (const f of files) {
    const profs = (f.profNames || []).filter(p => p && p.length > 4);
    const profStr = profs.length > 0 ? ` par ${profs.join(', ')}` : '';
    const schoolStr = f.schoolName ? ` (${f.schoolName})` : '';
    const newDesc = `${f.generalSubject} - ${f.title.split(' - ')[0] || 'Exercice'}${profStr}${schoolStr}. Ce document éducatif tunisien couvre les concepts clés de cette matière avec exercices et corrigés pour les élèves.`;
    
    try {
      await p.resource.update({ where: { id: f.id }, data: { description: newDesc.substring(0, 280) } });
      // Also update ResourceSummary
      await p.resourceSummary.upsert({
        where: { resourceId: f.id },
        create: { resourceId: f.id, summary: newDesc.substring(0, 280) },
        update: { summary: newDesc.substring(0, 280) },
      });
      success++;
    } catch (e) {
      console.error(`  FAIL #${f.numericId}: ${e.message}`);
    }
  }
  console.log(`Updated ${success} files`);
  await p.$disconnect();
})();
