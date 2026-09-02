require('dotenv').config({ path: '/workspace/edutunisie/.env.local' });
const { PrismaClient } = require('/workspace/edutunisie/node_modules/@prisma/client');
const OpenAI = require('openai');
const p = new PrismaClient({ log: ['error'] });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Args: subject slug, min pages, max pages
const args = process.argv.slice(2);
const SUBJECT = args[0] || 'physique';
const MIN_PAGES = parseInt(args[1] || '30', 10);
const MAX_PAGES = parseInt(args[2] || '999', 10);
const MODEL_TAG = `gpt-4o-mini-reprocess-${SUBJECT}-v1`;

const SUBJECTS = {
  mathematiques: { label: 'mathématiques', typeTag: 'Math', parsePattern: /Exercice\s+(\d+)/i },
  physique: { label: 'physique', typeTag: 'Physique|Chimie', parsePattern: /Exercice\s+(\d+)/i },
  svt: { label: 'SVT', typeTag: 'SVT', parsePattern: /Exercice\s+(\d+)/i },
};
const cfg = SUBJECTS[SUBJECT] || SUBJECTS.physique;

function chunkText(fullText, maxChars = 25000) {
  if (fullText.length <= maxChars) return [fullText];
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

async function extractForChunk(file, chunk) {
  const nonce = `${file.numericId}-${Date.now()}-${Math.random()}`;
  
  // Build the system prompt based on subject
  let typeInstructions = '';
  if (SUBJECT === 'physique') {
    typeInstructions = `Pour CHAQUE exercice, type = "Physique" ou "Chimie"`;
  } else if (SUBJECT === 'mathematiques') {
    typeInstructions = `Type = "Math" pour tous les exercices`;
  } else {
    typeInstructions = `Type = "${cfg.typeTag}" pour tous les exercices`;
  }
  
  const systemPrompt = `Tu es un expert en ${cfg.label} du système éducatif tunisien.
Analyse le contenu d'un document ${file.type} de ${cfg.label} pour ${file.class_slug} (${file.section_name || 'toutes sections'})
et extrais TOUS les exercices avec leur résumé en 1 phrase.

Pour CHAQUE exercice trouvé, retourne une ligne au format EXACT:
"Exercice N (${cfg.typeTag}): [résumé en 1 phrase FRANÇAISE, 15-25 mots]"

Règles:
- ${typeInstructions}
- TOUS les exercices doivent être listés, sans limite de nombre
- Numérotation: respecte la numérotation du document
- Résumé concis: sujet précis, pas générique
- Document peut être en arabe ou français: extrais en français

Retourne UNIQUEMENT le JSON: {"exercises": ["Exercice 1 (...): ...", "Exercice 2 (...): ...", ...]}

numéro du fichier: ${nonce}`;

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
    console.error(`  Parse ERROR: ${content.substring(0, 200)}`);
    return [];
  }
}

async function processFile(file) {
  if (!file.fullText || file.fullText.length < 100) {
    console.log(`  #${file.numericId}: skipped (text too short)`);
    return null;
  }
  
  const chunks = chunkText(file.fullText, 25000);
  console.log(`  #${file.numericId} pages=${file.pageCount} text=${file.fullText.length}b chunks=${chunks.length}`);
  
  let allExercises = [];
  for (let i = 0; i < chunks.length; i++) {
    try {
      const ex = await extractForChunk(file, chunks[i]);
      console.log(`    Chunk ${i+1}/${chunks.length}: ${ex.length} exercises`);
      allExercises = allExercises.concat(ex);
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
  console.log(`Re-processing ${SUBJECT} files with ${MIN_PAGES}-${MAX_PAGES} pages`);
  
  const files = await p.$queryRaw`
    SELECT r.id, r."numericId", r."fileKey", r.title, r.type, r."schoolType",
      s.slug as subject_slug, c.slug as class_slug, sec."nameFr" as section_name,
      cnt."fullText", cnt."pageCount",
      rm."modelUsed", array_length(rm."keyInsights", 1) as ki
    FROM "Resource" r
    JOIN "Subject" s ON r."subjectId" = s.id
    JOIN "Class" c ON r."classId" = c.id
    LEFT JOIN "Section" sec ON r."sectionId" = sec.id
    LEFT JOIN "ResourceContent" cnt ON cnt."resourceId" = r.id
    LEFT JOIN "ResourceMetadata" rm ON rm."resourceId" = r.id
    WHERE r.status = 'PUBLISHED'
      AND s.slug = ${SUBJECT}
      AND cnt."pageCount" >= ${MIN_PAGES}
      AND cnt."pageCount" <= ${MAX_PAGES}
      AND (rm."modelUsed" IS NULL OR rm."modelUsed" NOT IN (${MODEL_TAG}, 'gpt-4o-mini-prof1199', 'gpt-4o-mini-prof1199-v1'))
    ORDER BY r."numericId" ASC
  `;
  
  console.log(`Found ${files.length} files to re-process`);
  
  if (files.length === 0) {
    console.log('Nothing to do.');
    await p.$disconnect();
    return;
  }
  
  let totalBefore = 0, totalAfter = 0;
  const allResults = [];
  
  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    
    // Skip COURS files (no exercises to extract)
    if (f.type === 'COURSE') {
      console.log(`\n[${i+1}/${files.length}] #${f.numericId}: SKIPPED (COURSE type)`);
      continue;
    }
    
    const before = f.ki || 0;
    totalBefore += before;
    console.log(`\n[${i+1}/${files.length}] #${f.numericId}: ${f.title.substring(0, 60)}`);
    console.log(`  Before: ${before} exercises`);
    
    const exercises = await processFile(f);
    if (exercises && exercises.length > 0) {
      const after = exercises.length;
      totalAfter += after;
      console.log(`  After: ${after} exercises`);
      allResults.push({ id: f.id, numericId: f.numericId, before, after, exercises });
      
      try {
        await p.resourceMetadata.upsert({
          where: { resourceId: f.id },
          create: { resourceId: f.id, keyInsights: exercises, modelUsed: MODEL_TAG },
          update: { keyInsights: exercises, modelUsed: MODEL_TAG },
        });
        console.log(`  ✓ Updated DB`);
      } catch (e) {
        console.error(`  DB update ERROR: ${e.message}`);
      }
    } else {
      console.log(`  SKIP update (no exercises extracted)`);
    }
    
    if (i < files.length - 1) await new Promise(r => setTimeout(r, 500));
  }
  
  console.log(`\n\n=== SUMMARY ===`);
  console.log(`Subject: ${SUBJECT} (${MIN_PAGES}-${MAX_PAGES} pages)`);
  console.log(`Files processed: ${files.length}`);
  console.log(`Total exercises before: ${totalBefore}`);
  console.log(`Total exercises after: ${totalAfter}`);
  console.log(`Improvement: +${totalAfter - totalBefore} exercises (+${Math.round((totalAfter - totalBefore) / Math.max(1, totalBefore) * 100)}%)`);
  
  require('fs').writeFileSync(`/tmp/reprocess_${SUBJECT}_results.json`, JSON.stringify(allResults, null, 2));
  await p.$disconnect();
})();
