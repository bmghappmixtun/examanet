require('dotenv').config({ path: '/workspace/edutunisie/.env.local' });
const { PrismaClient } = require('/workspace/edutunisie/node_modules/@prisma/client');
const p = new PrismaClient({ log: ['error'] });
(async () => {
  // Find files with very short/general generalSubject
  const candidates = await p.$queryRaw`
    SELECT rm.id, r."numericId", rm."generalSubject", rm.topics
    FROM "ResourceMetadata" rm
    JOIN "Resource" r ON r.id = rm."resourceId"
    WHERE r.status = 'PUBLISHED' AND r."subjectId" IN (SELECT id FROM "Subject" WHERE slug = 'physique')
      AND (
        rm."generalSubject" IN ('Éducation', 'Physique', 'Chimie', 'Lycée', 'Tunisie')
        OR LENGTH(rm."generalSubject") < 8
      )
  `;
  console.log(`Found ${candidates.length} files with very generic generalSubject`);
  
  const STOP = new Set(['physique', 'chimie', 'sciences', 'physiques', 'physique et chimie', 'sciences physiques', 'physique-chimie', 'pc', 'tunisie', 'tunisien', 'lycée', 'secondaire', 'bac', 'annee', 'année', 'cours', 'devoir', 'série', 'serie', 'exercice', 'exercices', 'controle', 'contrôle', 'synthese', 'synthèse', 'magnitude', 'rendement', 'energie', 'énergie', 'mole', 'atome', 'atomes', 'ion', 'ions', 'molecule', 'molécule', 'molécules', 'éducation', 'education', 'lycee']);
  
  let success = 0;
  for (const f of candidates) {
    if (!f.topics || !Array.isArray(f.topics)) continue;
    const filtered = f.topics.map(t => (t || '').trim()).filter(t => t.length > 3 && !STOP.has(t.toLowerCase()));
    if (filtered.length === 0) continue;
    const newGs = filtered.slice(0, 3).join(' - ').substring(0, 60);
    if (newGs && newGs !== f.generalSubject) {
      try {
        await p.resourceMetadata.update({ where: { id: f.id }, data: { generalSubject: newGs } });
        success++;
      } catch (e) { console.error(`  FAIL #${f.numericId}: ${e.message}`); }
    }
  }
  console.log(`Updated ${success} files`);
  await p.$disconnect();
})();
