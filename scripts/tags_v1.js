require('dotenv').config({ path: '/workspace/edutunisie/.env.local' });
const { PrismaClient } = require('/workspace/edutunisie/node_modules/@prisma/client');
const p = new PrismaClient({ log: ['error'] });

(async () => {
  console.log('Loading v1 physique lycée files...');
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
  `;
  console.log(`Files to tag: ${files.length}`);
  
  // Build tags for each file
  const updates = [];
  for (const f of files) {
    const tags = new Set();
    
    // Subject
    tags.add('Physique');
    
    // Class (full + short)
    tags.add(f.class_name);
    const shortClass = f.class_slug.replace('-secondaire', '');
    tags.add(shortClass); // e.g. "1ere", "2eme", "3eme", "4eme"
    
    // Type
    if (f.type === 'DEVOIR') tags.add('Devoir');
    else if (f.type === 'COURSE') tags.add('Cours');
    else if (f.type === 'EXERCISE') tags.add("Série d'exercices");
    else if (f.type === 'EXAM') tags.add('Examen');
    else if (f.type === 'CORRECTION') tags.add('Corrigé');
    
    // Section (if any)
    if (f.section_name) tags.add(f.section_name);
    
    // School
    if (f.schoolName && typeof f.schoolName === 'string' && f.schoolName.length > 0) {
      tags.add(f.schoolName);
    }
    
    // Profs
    if (Array.isArray(f.profNames)) {
      for (const prof of f.profNames) {
        // Skip single-char or initial-only profs (e.g. "K", "A.")
        if (prof && prof.length > 4 && /\s/.test(prof.trim())) tags.add(prof);
        // Also add "Mr X" prefixed profs as just "X"
      }
    }
    
    // Topics from generalSubject
    if (f.generalSubject && typeof f.generalSubject === 'string') {
      // Extract topic keywords (each word capitalized, 4+ chars, not common stop words)
      const stopWords = new Set(['le', 'la', 'les', 'de', 'du', 'des', 'un', 'une', 'et', 'en', 'à', 'au', 'aux', 'par', 'pour', 'sur', 'avec', 'sans', 'dans', 'entre', 'n°', 'no', 'sciences', 'physiques', 'physique', 'chimie', 'chimiques', 'devoir', 'cours', 'contrôle', 'controle', 'synthèse', 'synthese', 'série', 'serie', 'exercices', 'exercice', 'lycée', 'college', 'tunisie', 'tunisien', 'tunisienne', 'année', 'annee', 'secondaire', 'bac', 'd\'un', 'd\'une', 'l\'un', 'l\'une', 'd\'', 'l\'']);
      // Split, filter, clean
      const words = f.generalSubject
        .split(/[\s\-:;,()\/]+/)
        .map(w => w.replace(/^['''`]/, '').replace(/['''`]$/, '')) // strip apostrophes
        .filter(w => w.length > 4 && !stopWords.has(w.toLowerCase()))
        .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
      // De-dup similar (Cinem vs Cinematique)
      const seen = new Set();
      for (const w of words.slice(0, 5)) {
        const k = w.toLowerCase().substring(0, 4);
        if (!seen.has(k)) { tags.add(w); seen.add(k); }
      }
    }
    
    // School type
    if (f.schoolType === 'PILOTE') tags.add('Lycée Pilote');
    
    // Country
    tags.add('Tunisie');
    
    // Convert to CSV
    const tagsCsv = Array.from(tags).join(', ');
    updates.push({ id: f.id, numericId: f.numericId, tags: tagsCsv });
  }
  
  console.log(`Built ${updates.length} tag updates`);
  
  // Show first 5 samples
  console.log('\n=== Samples ===');
  for (const u of updates.slice(0, 5)) {
    console.log(`#${u.numericId}: ${u.tags}`);
  }
  
  // Apply updates sequentially (avoid timeout)
  let success = 0, failed = 0;
  for (let i = 0; i < updates.length; i++) {
    const u = updates[i];
    try {
      await p.resource.update({
        where: { id: u.id },
        data: { tags: u.tags },
      });
      success++;
      if (success % 200 === 0) console.log(`  ${i}/${updates.length} (success=${success}, failed=${failed})`);
    } catch (e) {
      failed++;
      console.error(`  FAIL #${u.numericId}: ${e.message}`);
    }
  }
  
  console.log(`\nDone. success=${success}, failed=${failed}`);
  await p.$disconnect();
})();
