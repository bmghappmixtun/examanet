require('dotenv').config({ path: '/workspace/edutunisie/.env.local' });
const { PrismaClient } = require('/workspace/edutunisie/node_modules/@prisma/client');
const p = new PrismaClient({ log: ['error'] });
(async () => {
  const files = await p.$queryRaw`
    SELECT rm."generalSubject", COUNT(*) as count
    FROM "ResourceMetadata" rm
    JOIN "Resource" r ON r.id = rm."resourceId"
    WHERE r.status = 'PUBLISHED'
      AND r."subjectId" IN (SELECT id FROM "Subject" WHERE slug = 'physique')
    GROUP BY rm."generalSubject"
    ORDER BY count DESC
  `;
  console.log('=== Physique generalSubjects ===');
  for (const f of files) {
    console.log(`  ${f.count}x: ${f.generalSubject?.substring(0, 80) || 'NULL'}`);
  }
  
  // Now find GENERIC ones
  const genericPatterns = [
    /^(devoir de contrôle|devoir de synthèse|cours|série d'exercices|examen)\b/i,
    /^n[°o]\s*\d+/i,
    /^lycée\s+tunisien/i,
    /^physique( et chimie)?( au lycée)?$/i,
    /^sciences?\s*physiques?$/i,
    /^physique$/i,
    /^chimie$/i,
    /^math[ée]matiques?$/i,
    /^(1ère|2ème|3ème|4ème|1ere|2eme|3eme|4eme)\s+(ann[ée]e|as)\b/i,
    /^bac\b/i,
    /^\d+\s*$/,
    /^.{0,15}$/,  // too short
  ];
  
  const generic = await p.$queryRaw`
    SELECT rm.id as rmId, r."numericId", r.title, rm."generalSubject", rm."modelUsed"
    FROM "ResourceMetadata" rm
    JOIN "Resource" r ON r.id = rm."resourceId"
    WHERE r.status = 'PUBLISHED'
      AND r."subjectId" IN (SELECT id FROM "Subject" WHERE slug = 'physique')
      AND rm."generalSubject" IS NOT NULL
  `;
  
  const generics = [];
  for (const f of generic) {
    const gs = f.generalSubject || '';
    let isGeneric = false;
    let matched = '';
    for (const pat of genericPatterns) {
      if (pat.test(gs)) { isGeneric = true; matched = pat.source; break; }
    }
    if (isGeneric) generics.push({ ...f, matched });
  }
  console.log(`\n=== GENERIC subjects: ${generics.length} of ${generic.length} ===`);
  for (const f of generics.slice(0, 30)) {
    console.log(`  #${f.numericId} [${f.modelUsed?.substring(0, 20)}]: ${f.generalSubject}`);
  }
  if (generics.length > 30) console.log(`  ... and ${generics.length - 30} more`);
  
  await p.$disconnect();
})();
