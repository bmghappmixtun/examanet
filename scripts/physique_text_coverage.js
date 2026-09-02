require('dotenv').config({ path: '/workspace/edutunisie/.env.local' });
const { PrismaClient } = require('/workspace/edutunisie/node_modules/@prisma/client');
const p = new PrismaClient({ log: ['error'] });
(async () => {
  const subject = await p.subject.findFirst({ where: { slug: 'physique' } });
  
  const files = await p.$queryRaw`
    SELECT r.id, r."numericId", r.title, r.type,
      rc."fullText" IS NOT NULL as has_text,
      LENGTH(rc."fullText") as text_len,
      rc."extractedAt" IS NOT NULL as has_extractedAt,
      rc."extractionMethod" as method,
      rc."extractionError" as error
    FROM "Resource" r
    JOIN "Class" c ON r."classId" = c.id
    JOIN "Level" l ON c."levelId" = l.id
    LEFT JOIN "ResourceContent" rc ON rc."resourceId" = r.id
    WHERE l.slug = 'lycee' AND r."subjectId" = ${subject.id} AND r.status = 'PUBLISHED'
  `;
  
  console.log(`Total files: ${files.length}`);
  const withText = files.filter(f => f.has_text).length;
  const withoutText = files.filter(f => !f.has_text).length;
  console.log(`Avec ResourceContent row:   ${withText} (${(withText/files.length*100).toFixed(1)}%)`);
  console.log(`SANS ResourceContent:        ${withoutText}`);
  
  // Distribution longueurs
  const lengths = files.filter(f => f.has_text).map(f => f.text_len);
  if (lengths.length > 0) {
    const avg = Math.round(lengths.reduce((a,b) => a+b, 0) / lengths.length);
    const min = Math.min(...lengths);
    const max = Math.max(...lengths);
    const zero = lengths.filter(l => l === 0).length;
    const short = lengths.filter(l => l < 500).length;
    const long = lengths.filter(l => l >= 5000).length;
    console.log(`\n=== Longueurs texte (chars) ===`);
    console.log(`  Avg: ${avg} | Min: ${min} | Max: ${max}`);
    console.log(`  Vides (0 char):       ${zero}`);
    console.log(`  Courts (<500 chars):  ${short}`);
    console.log(`  Longs (>=5000 chars): ${long}`);
  }
  
  // Methods
  const methods = {};
  for (const f of files.filter(f => f.has_text)) {
    methods[f.method || 'NULL'] = (methods[f.method || 'NULL'] || 0) + 1;
  }
  console.log(`\n=== Méthode d'extraction ===`);
  Object.entries(methods).forEach(([m, n]) => console.log(`  ${m.padEnd(25)} ${n}`));
  
  // Cross-tab: qui a RM mais pas de text?
  const rmFiles = await p.$queryRaw`
    SELECT r.id,
      rm."generalSubject" IS NOT NULL as has_gs,
      rc."fullText" IS NOT NULL as has_text
    FROM "Resource" r
    JOIN "Class" c ON r."classId" = c.id
    JOIN "Level" l ON c."levelId" = l.id
    LEFT JOIN "ResourceMetadata" rm ON rm."resourceId" = r.id
    LEFT JOIN "ResourceContent" rc ON rc."resourceId" = r.id
    WHERE l.slug = 'lycee' AND r."subjectId" = ${subject.id} AND r.status = 'PUBLISHED'
  `;
  
  const withRM_NoText = rmFiles.filter(f => f.has_gs && !f.has_text).length;
  const withRM_WithText = rmFiles.filter(f => f.has_gs && f.has_text).length;
  const noRM_NoText = rmFiles.filter(f => !f.has_gs && !f.has_text).length;
  const noRM_WithText = rmFiles.filter(f => !f.has_gs && f.has_text).length;
  
  console.log(`\n=== Cross-tab text/metadata ===`);
  console.log(`  Avec RM + avec text:  ${withRM_WithText}`);
  console.log(`  Avec RM + sans text:  ${withRM_NoText} ⚠️`);
  console.log(`  Sans RM + avec text:  ${noRM_WithText} ✓ enrichissable`);
  console.log(`  Sans RM + sans text:  ${noRM_NoText} ⚠️ OCR needed`);
  
  // Combien de fichiers avec erreurs d'extraction
  const errors = files.filter(f => f.error);
  console.log(`\n=== Erreurs d'extraction: ${errors.length} ===`);
  if (errors.length > 0) {
    const errTypes = {};
    for (const f of errors) {
      errTypes[f.error?.substring(0, 50) || 'NULL'] = (errTypes[f.error?.substring(0, 50) || 'NULL'] || 0) + 1;
    }
    Object.entries(errTypes).slice(0, 5).forEach(([e, n]) => console.log(`  ${e.padEnd(50)} ${n}`));
  }
  
  await p.$disconnect();
})();
