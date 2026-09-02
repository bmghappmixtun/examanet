require('dotenv').config({ path: '/workspace/edutunisie/.env.local' });
const { PrismaClient } = require('/workspace/edutunisie/node_modules/@prisma/client');
const OpenAI = require('openai');
const p = new PrismaClient({ log: ['error'] });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const MODEL_TAG = 'gpt-4o-mini-physique-missing-v1';

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
  
  const systemPrompt = `Tu es un expert en physique-chimie du système éducatif tunisien.
Analyse le contenu d'un document ${file.type} de physique pour ${file.class_slug} (${file.section_name || 'toutes sections'})
et extrais TOUS les exercices avec leur résumé en 1 phrase.

Pour CHAQUE exercice trouvé, retourne une ligne au format EXACT:
"Exercice N (Physique|Chimie): [résumé en 1 phrase FRANÇAISE, 15-25 mots]"

Règles:
- Type = "Physique" ou "Chimie"
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
    console.log(`  #${file.numericId}: skipped (text too short: ${file.fullText?.length || 0})`);
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
  
  // Dedup
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
  console.log('Loading physique lycée files without keyInsights...');
  
  const files = await p.$queryRaw`
    SELECT r.id, r."numericId", r."fileKey", r.title, r.type, r."schoolType",
      s.slug as subject_slug, c.slug as class_slug, sec."nameFr" as section_name,
      cnt."fullText", cnt."pageCount"
    FROM "Resource" r
    JOIN "Subject" s ON r."subjectId" = s.id
    JOIN "Class" c ON r."classId" = c.id
    LEFT JOIN "Section" sec ON r."sectionId" = sec.id
    LEFT JOIN "ResourceContent" cnt ON cnt."resourceId" = r.id
    LEFT JOIN "ResourceMetadata" rm ON rm."resourceId" = r.id
    WHERE r.status = 'PUBLISHED'
      AND s.slug = 'physique'
      AND c."levelId" IN (SELECT id FROM "Level" WHERE slug = 'lycee')
      AND r.type IN ('DEVOIR', 'CORRECTION')
      AND (rm."keyInsights" IS NULL OR array_length(rm."keyInsights", 1) = 0)
    ORDER BY r."numericId" ASC
  `;
  
  console.log(`Files to process: ${files.length}`);
  
  if (files.length === 0) {
    console.log('Nothing to do.');
    await p.$disconnect();
    return;
  }
  
  let totalBefore = 0, totalAfter = 0;
  const allResults = [];
  let failed = 0;
  
  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    console.log(`\n[${i+1}/${files.length}] #${f.numericId} [${f.type}]: ${f.title.substring(0, 60)}`);
    
    const exercises = await processFile(f);
    if (exercises && exercises.length > 0) {
      const after = exercises.length;
      totalAfter += after;
      console.log(`  ✓ Found ${after} exercises`);
      allResults.push({ id: f.id, numericId: f.numericId, type: f.type, after, exercises });
      
      try {
        await p.resourceMetadata.upsert({
          where: { resourceId: f.id },
          create: { resourceId: f.id, keyInsights: exercises, modelUsed: MODEL_TAG },
          update: { keyInsights: exercises, modelUsed: MODEL_TAG },
        });
      } catch (e) {
        failed++;
        console.error(`  DB update ERROR: ${e.message}`);
      }
    } else {
      failed++;
      console.log(`  ✗ No exercises extracted`);
    }
    
    if (i < files.length - 1) await new Promise(r => setTimeout(r, 300));
  }
  
  console.log(`\n\n=== SUMMARY ===`);
  console.log(`Files processed: ${files.length}`);
  console.log(`Failed (no exercises): ${failed}`);
  console.log(`Success: ${files.length - failed}`);
  console.log(`Total exercises added: ${totalAfter}`);
  console.log(`Average per file: ${(totalAfter / Math.max(1, files.length - failed)).toFixed(1)}`);
  
  require('fs').writeFileSync('/tmp/fix_missing_ki_results.json', JSON.stringify(allResults, null, 2));
  await p.$disconnect();
})();
