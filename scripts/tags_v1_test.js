require('dotenv').config({ path: '/workspace/edutunisie/.env.local' });
const { PrismaClient } = require('/workspace/edutunisie/node_modules/@prisma/client');
const p = new PrismaClient({ log: ['error'] });

(async () => {
  const files = await p.$queryRaw`
    SELECT r.id, r."numericId", r.title, r.type, r."schoolType", r.tags,
      c."nameFr" as class_name, c.slug as class_slug,
      sec."nameFr" as section_name,
      rm."generalSubject", rm."schoolName", rm."profNames"
    FROM "Resource" r
    JOIN "Class" c ON r."classId" = c.id
    JOIN "Level" l ON c."levelId" = l.id
    JOIN "Subject" s ON r."subjectId" = s.id
    LEFT JOIN "Section" sec ON r."sectionId" = sec.id
    JOIN "ResourceMetadata" rm ON rm."resourceId" = r.id
    WHERE l.slug = 'lycee' AND s.slug = 'physique' AND r.status = 'PUBLISHED'
      AND rm."modelUsed" = 'gpt-4o-mini-physique-v1'
      AND (r.tags IS NULL OR r.tags = '')
    ORDER BY r."numericId" ASC
    LIMIT 10
  `;
  
  for (const f of files) {
    const tags = new Set();
    tags.add('Physique');
    tags.add(f.class_name);
    tags.add(f.class_slug.replace('-secondaire', ''));
    if (f.type === 'DEVOIR') tags.add('Devoir');
    else if (f.type === 'COURSE') tags.add('Cours');
    else if (f.type === 'EXERCISE') tags.add("Série d'exercices");
    else if (f.type === 'EXAM') tags.add('Examen');
    else if (f.type === 'CORRECTION') tags.add('Corrigé');
    if (f.section_name) tags.add(f.section_name);
    if (f.schoolName && typeof f.schoolName === 'string' && f.schoolName.length > 0) tags.add(f.schoolName);
    if (Array.isArray(f.profNames)) {
      for (const prof of f.profNames) {
        if (prof && prof.length > 2) tags.add(prof);
      }
    }
    if (f.generalSubject && typeof f.generalSubject === 'string') {
      const stopWords = new Set(['le', 'la', 'les', 'de', 'du', 'des', 'un', 'une', 'et', 'en', 'à', 'au', 'aux', 'par', 'pour', 'sur', 'avec', 'sans', 'dans', 'entre', 'n°', 'no', 'sciences', 'physiques', 'physique', 'chimie', 'chimiques', 'devoir', 'cours', 'contrôle', 'controle', 'synthèse', 'synthese', 'série', 'serie', 'exercices', 'exercice', 'lycée', 'college', 'tunisie', 'tunisien', 'tunisienne', 'année', 'annee', 'secondaire', 'bac']);
      const words = f.generalSubject.split(/[\s\-:;,()\/]+/).filter(w => w.length > 3 && !stopWords.has(w.toLowerCase())).map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
      for (const w of words.slice(0, 5)) tags.add(w);
    }
    if (f.schoolType === 'PILOTE') tags.add('Lycée Pilote');
    tags.add('Tunisie');
    
    const tagsCsv = Array.from(tags).join(', ');
    console.log(`\n#${f.numericId} [${f.type}]`);
    console.log(`  Class: ${f.class_name}, Section: ${f.section_name || 'NULL'}`);
    console.log(`  School: ${f.schoolName || 'NULL'}`);
    console.log(`  Profs: ${JSON.stringify(f.profNames)}`);
    console.log(`  generalSubject: ${f.generalSubject}`);
    console.log(`  → TAGS (${tags.size}): ${tagsCsv}`);
  }
  
  await p.$disconnect();
})();
