require('dotenv').config({ path: '/workspace/edutunisie/.env.local' });
const { PrismaClient } = require('/workspace/edutunisie/node_modules/@prisma/client');
const p = new PrismaClient({ log: ['error'] });
(async () => {
  const subject = await p.subject.findFirst({ where: { slug: 'physique' } });
  console.log(`Subject: ${subject.slug} (${subject.id})`);
  
  const files = await p.$queryRaw`
    SELECT r.id, r."numericId", r.title, r.type, r.year, r."hasCorrection",
      c."nameFr" as class_name,
      s."nameFr" as section_name,
      rm."generalSubject", rm."keyPoints", rm."shortKeyPoints", rm.topics, rm.subject, rm."modelUsed" as meta_model,
      rs.summary as summary_text, rs."summaryOriginal" as summary_orig, rs."modelUsed" as summary_model
    FROM "Resource" r
    JOIN "Class" c ON r."classId" = c.id
    JOIN "Level" l ON c."levelId" = l.id
    LEFT JOIN "Section" s ON r."sectionId" = s.id
    LEFT JOIN "ResourceMetadata" rm ON rm."resourceId" = r.id
    LEFT JOIN "ResourceSummary" rs ON rs."resourceId" = r.id
    WHERE l.slug = 'lycee' AND r."subjectId" = ${subject.id} AND r.status = 'PUBLISHED'
    ORDER BY r."numericId" ASC
  `;
  
  console.log(`Total files: ${files.length}`);
  
  const withGS = files.filter(f => f.generalSubject).length;
  const withKP = files.filter(f => f.keyPoints && f.keyPoints.length > 0).length;
  const withShortKP = files.filter(f => f.shortKeyPoints && f.shortKeyPoints.length > 0).length;
  const withTopics = files.filter(f => f.topics && f.topics.length > 0).length;
  const withSummary = files.filter(f => f.summary_text).length;
  const totallyEmpty = files.filter(f => !f.generalSubject && (!f.keyPoints || f.keyPoints.length === 0) && (!f.shortKeyPoints || f.shortKeyPoints.length === 0) && !f.summary_text).length;
  
  console.log(`\n=== État ===`);
  console.log(`  Avec generalSubject:        ${withGS}`);
  console.log(`  Avec keyPoints (longs):     ${withKP}`);
  console.log(`  Avec shortKeyPoints:        ${withShortKP}`);
  console.log(`  Avec topics:                ${withTopics}`);
  console.log(`  Avec summary:               ${withSummary}`);
  console.log(`  TOTALEMENT VIDE:            ${totallyEmpty}`);
  
  // Modèles utilisés
  const modelUsed = {};
  for (const f of files) {
    const m = f.meta_model || f.summary_model || 'NONE';
    modelUsed[m] = (modelUsed[m] || 0) + 1;
  }
  console.log(`\n=== Modèles utilisés ===`);
  Object.entries(modelUsed).sort((a,b) => b[1]-a[1]).forEach(([m, n]) => {
    console.log(`  ${m.padEnd(30)} ${n}`);
  });
  
  // Sample
  console.log(`\n=== Sample 5 premiers ===`);
  for (const f of files.slice(0, 5)) {
    console.log(`  #${f.numericId} (${(f.class_name || '-').substring(0, 25)}): ${f.title.substring(0, 60)}`);
    console.log(`    GS: ${f.generalSubject || '∅'} | sKP[${f.shortKeyPoints?.length || 0}] | summary: ${f.summary_text?.substring(0, 50) || '∅'}`);
  }
  
  // Distribution par classe
  const byClass = {};
  for (const f of files) byClass[f.class_name || 'NULL'] = (byClass[f.class_name || 'NULL'] || 0) + 1;
  console.log(`\n=== Distribution par classe ===`);
  Object.entries(byClass).sort((a, b) => b[1] - a[1]).forEach(([c, n]) => {
    console.log(`  ${c.padEnd(35)} ${String(n).padStart(4)}`);
  });
  
  // Type
  const byType = {};
  for (const f of files) byType[f.type] = (byType[f.type] || 0) + 1;
  console.log(`\n=== Distribution par type ===`);
  Object.entries(byType).sort((a, b) => b[1] - a[1]).forEach(([t, n]) => {
    console.log(`  ${(t || 'NULL').padEnd(15)} ${String(n).padStart(4)}`);
  });
  
  // Year
  const byYear = {};
  for (const f of files) byYear[f.year || 'NULL'] = (byYear[f.year || 'NULL'] || 0) + 1;
  console.log(`\n=== Top 10 années ===`);
  Object.entries(byYear).sort((a, b) => b[1] - a[1]).slice(0, 10).forEach(([y, n]) => {
    console.log(`  ${y.padEnd(12)} ${String(n).padStart(4)}`);
  });
  
  // Fichiers partiels
  const partial = files.filter(f => f.meta_model && !f.generalSubject);
  console.log(`\n=== "Partiels" (ont RM mais pas GS): ${partial.length} ===`);
  if (partial.length > 0) {
    console.log('  Sample 3:');
    for (const f of partial.slice(0, 3)) {
      console.log(`  #${f.numericId} meta_model=${f.meta_model} | keyPoints=${f.keyPoints?.length || 0}`);
    }
  }
  
  await p.$disconnect();
})();
