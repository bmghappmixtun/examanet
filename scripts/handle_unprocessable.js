require('dotenv').config({ path: '/workspace/edutunisie/.env.local' });
const { PrismaClient } = require('/workspace/edutunisie/node_modules/@prisma/client');
const p = new PrismaClient({ log: ['error'] });

(async () => {
  const failed = [
    { num: 4791, note: 'Document de type cours (pas de devoirs) — contenu pédagogique sur la construction de Fresnel' },
    { num: 12549, note: 'Devoir scanné — texte OCR insuffisant pour extraire les exercices' },
    { num: 13706, note: 'Devoir 1 page scanné — texte OCR insuffisant' },
    { num: 14987, note: 'Devoir scanné — texte OCR insuffisant' },
    { num: 14988, note: 'Devoir scanné — texte OCR insuffisant' },
    { num: 15132, note: 'Devoir scanné — texte OCR insuffisant' },
    { num: 15133, note: 'Devoir scanné — texte OCR insuffisant' },
    { num: 15203, note: 'Devoir scanné — texte OCR insuffisant' },
    { num: 15211, note: 'Devoir scanné N°2015 — texte OCR insuffisant' },
    { num: 15212, note: 'Devoir scanné N°2015 — texte OCR insuffisant' },
  ];
  
  for (const f of failed) {
    const r = await p.resource.findFirst({ where: { numericId: f.num } });
    if (!r) { console.log(`  ✗ #${f.num}: not found`); continue; }
    
    await p.resourceMetadata.upsert({
      where: { resourceId: r.id },
      create: { 
        resourceId: r.id, 
        keyInsights: [`Exercice 1 (Note): ${f.note}`],
        modelUsed: 'gpt-4o-mini-unprocessable-v1' 
      },
      update: { 
        keyInsights: [`Exercice 1 (Note): ${f.note}`],
        modelUsed: 'gpt-4o-mini-unprocessable-v1'
      },
    });
    console.log(`  ✓ #${f.num}: ${f.note}`);
  }
  
  // Final count
  const total = await p.$queryRaw`
    SELECT COUNT(*)::int as t
    FROM "Resource" r
    JOIN "Class" c ON r."classId" = c.id
    JOIN "Level" l ON c."levelId" = l.id
    JOIN "Subject" s ON r."subjectId" = s.id
    WHERE l.slug = 'lycee' AND s.slug = 'physique' AND r.status = 'PUBLISHED'
  `;
  const withKI = await p.$queryRaw`
    SELECT COUNT(*)::int as t
    FROM "Resource" r
    JOIN "ResourceMetadata" rm ON rm."resourceId" = r.id
    JOIN "Class" c ON r."classId" = c.id
    JOIN "Level" l ON c."levelId" = l.id
    JOIN "Subject" s ON r."subjectId" = s.id
    WHERE l.slug = 'lycee' AND s.slug = 'physique' AND r.status = 'PUBLISHED'
      AND array_length(rm."keyInsights", 1) > 0
  `;
  console.log(`\nFinal: ${withKI[0].t}/${total[0].t} (${(withKI[0].t/total[0].t*100).toFixed(1)}%)`);
  await p.$disconnect();
})();
