require('dotenv').config({ path: '/workspace/edutunisie/.env.local' });
const { PrismaClient } = require('/workspace/edutunisie/node_modules/@prisma/client');
const OpenAI = require('openai');
const p = new PrismaClient({ log: ['error'] });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const SUBJECTS = {
  mathematiques: 'mathématiques',
  physique: 'physique',
  svt: 'SVT',
};

function getSubjectLabel(slug) {
  return SUBJECTS[slug] || slug;
}

// Split text into chunks respecting page boundaries
function chunkText(fullText, maxChars = 25000) {
  if (fullText.length <= maxChars) return [fullText];
  // Split by "Exercice N" markers (keep markers)
  const parts = fullText.split(/(?=Exercice\s+\d+)/i);
  const chunks = [];
  let current = '';
  for (const part of parts) {
    if (current.length + part.length > maxChars && current.length > 0) {
      chunks.push(current);
      current = part;
    } else {
      current += part;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

async function extractExercisesForChunk(file, chunk, isMultiChunk) {
  const subject = getSubjectLabel(file.subject_slug);
  const nonce = `${file.numericId}-${Date.now()}-${Math.random()}`;
  
  const systemPrompt = `Tu es un expert en physique-chimie du système éducatif tunisien. Analyse le contenu d'un document ${file.type} de ${subject} pour ${file.class_slug} (${file.section_name || 'toutes sections'}) et extrais TOUS les exercices avec leur résumé en 1 phrase.

Pour CHAQUE exercice trouvé, retourne une ligne au format EXACT:
"Exercice N (Physique|Chimie): [résumé en 1 phrase FRANÇAISE, 15-25 mots]"

Règles:
- TOUS les exercices doivent être listés, sans limite de nombre
- Numérotation: respecte la numérotation du document (1, 2, 3, ...)
- Type: "Physique" si c'est de la physique, "Chimie" si c'est de la chimie, "Math" si c'est des maths
- Résumé concis: sujet précis de l'exercice, pas générique
- Si l'exercice a plusieurs parties, mentionne les points clés du sujet
- Document peut être en arabe ou français: extrais en français

Retourne UNIQUEMENT le JSON: {"exercises": ["Exercice 1 (...): ...", "Exercice 2 (...): ...", ...]}

numéro du fichier pour traçabilité: ${nonce}`;

  const userPrompt = `Analyse ce document et extrais TOUS les exercices:

---DOCUMENT---
${chunk}
---FIN---`;

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.1,
    max_tokens: 4000,
  });
  
  const content = response.choices[0].message.content;
  try {
    const parsed = JSON.parse(content);
    return parsed.exercises || [];
  } catch (e) {
    console.error(`  Failed to parse response: ${content.substring(0, 200)}`);
    return [];
  }
}

async function processFile(file) {
  if (!file.fullText || file.fullText.length < 100) {
    console.log(`  #${file.numericId}: skipped (text too short: ${file.fullText?.length || 0})`);
    return null;
  }
  
  const chunks = chunkText(file.fullText, 25000);
  console.log(`  #${file.numericId} pages=${file.pageCount} text=${file.fullText.length}b chunks=${chunks.length}`);
  
  let allExercises = [];
  for (let i = 0; i < chunks.length; i++) {
    try {
      const ex = await extractExercisesForChunk(file, chunks[i], chunks.length > 1);
      console.log(`    Chunk ${i+1}/${chunks.length}: ${ex.length} exercises`);
      allExercises = allExercises.concat(ex);
      // Rate limit
      if (i < chunks.length - 1) await new Promise(r => setTimeout(r, 200));
    } catch (e) {
      console.error(`    Chunk ${i+1} ERROR: ${e.message}`);
    }
  }
  
  // Dedup by exercise number
  const seen = new Set();
  const dedup = [];
  for (const e of allExercises) {
    const m = e.match(/Exercice\s+(\d+)/i);
    if (m) {
      const k = `ex-${m[1]}`;
      if (seen.has(k)) continue;
      seen.add(k);
    }
    dedup.push(e);
  }
  
  return dedup;
}

(async () => {
  const prof = await p.user.findFirst({ where: { numericId: 1199 } });
  const profId = prof.id;
  
  const files = await p.$queryRaw`
    SELECT r.id, r."numericId", r."fileKey", r.title, r.type, r."schoolType",
      s.slug as subject_slug, c.slug as class_slug, sec."nameFr" as section_name,
      cnt."fullText", cnt."pageCount",
      rm."modelUsed", rm."keyInsights"
    FROM "Resource" r
    JOIN "Subject" s ON r."subjectId" = s.id
    JOIN "Class" c ON r."classId" = c.id
    LEFT JOIN "Section" sec ON r."sectionId" = sec.id
    LEFT JOIN "ResourceContent" cnt ON cnt."resourceId" = r.id
    LEFT JOIN "ResourceMetadata" rm ON rm."resourceId" = r.id
    WHERE r."teacherId" = ${profId}
    ORDER BY r."numericId" ASC
  `;
  
  console.log(`Processing ${files.length} files by prof 1199 (Gharbia Mohamed)`);
  
  let totalBefore = 0, totalAfter = 0;
  const allResults = [];
  
  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    const before = f.keyInsights?.length || 0;
    totalBefore += before;
    console.log(`\n[${i+1}/${files.length}] #${f.numericId}: ${f.title.substring(0, 60)}`);
    console.log(`  Before: ${before} exercises`);
    
    const exercises = await processFile(f);
    if (exercises) {
      const after = exercises.length;
      totalAfter += after;
      console.log(`  After: ${after} exercises`);
      allResults.push({ id: f.id, numericId: f.numericId, before, after, exercises });
      
      // Update DB
      try {
        await p.resourceMetadata.upsert({
          where: { resourceId: f.id },
          create: { resourceId: f.id, keyInsights: exercises, modelUsed: 'gpt-4o-mini-prof1199-v1' },
          update: { keyInsights: exercises, modelUsed: 'gpt-4o-mini-prof1199-v1' },
        });
        console.log(`  ✓ Updated DB`);
      } catch (e) {
        console.error(`  DB update ERROR: ${e.message}`);
      }
    }
    
    // Rate limit between files
    if (i < files.length - 1) await new Promise(r => setTimeout(r, 500));
  }
  
  console.log(`\n\n=== SUMMARY ===`);
  console.log(`Files processed: ${files.length}`);
  console.log(`Total exercises before: ${totalBefore}`);
  console.log(`Total exercises after: ${totalAfter}`);
  console.log(`Improvement: +${totalAfter - totalBefore} exercises (+${Math.round((totalAfter - totalBefore) / Math.max(1, totalBefore) * 100)}%)`);
  
  require('fs').writeFileSync('/tmp/prof_1199_results.json', JSON.stringify(allResults, null, 2));
  await p.$disconnect();
})();
