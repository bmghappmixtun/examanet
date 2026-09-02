#!/usr/bin/env node
/**
 * Math lycée batch processor (v2)
 * 
 * For each file in /tmp/math_lycee_to_generate.json:
 * 1. Get text from ResourceContent (if exists) or download via blob API + pdftotext
 * 2. If no text (scanned), mark as 'unprocessable' and skip
 * 3. Call OpenAI gpt-4o-mini to generate:
 *    - DEVOIR/EXERCISE: "Exercice N: sujet - résumé"
 *    - COURSE: "Titre: résumé"
 * 4. Save to ResourceMetadata.exerciseInsights
 * 5. Track progress in /tmp/math_lycee_batch_state.json for resume
 * 
 * Concurrency: 5 parallel workers
 */
import { PrismaClient } from '@prisma/client';
import OpenAI from 'openai';
import { config } from 'dotenv';
import fs from 'fs';
import { execSync } from 'child_process';

config({ path: '/workspace/edutunisie/.env.local' });

const p = new PrismaClient();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const BATCH_FILE = '/tmp/math_lycee_to_generate.json';
const STATE_FILE = '/tmp/math_lycee_batch_state.json';
const INTERNAL_TOKEN = process.env.INTERNAL_BULK_TOKEN || 'devmanet-bulk-2026';
const BASE_URL = 'https://examanet.com';
const CONCURRENCY = 5;
const MODEL = 'gpt-4o-mini';
const MODEL_TAG = 'gpt-4o-mini-math-lycee-v2';

const STATE = fs.existsSync(STATE_FILE)
  ? JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'))
  : { done: [], failed: [], skipped: [] };

function saveState() {
  fs.writeFileSync(STATE_FILE, JSON.stringify(STATE, null, 2));
}

async function getFileText(fileKey) {
  // Use the internal blob API
  const res = await fetch(`${BASE_URL}/api/blob-teacher/${fileKey}`, {
    headers: { 'X-Internal-Token': INTERNAL_TOKEN },
  });
  if (!res.ok) return null;
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 100) return null;
  
  const tmpPdf = `/tmp/batch_${Date.now()}_${Math.random().toString(36).slice(2)}.pdf`;
  const tmpTxt = `/tmp/batch_${Date.now()}_${Math.random().toString(36).slice(2)}.txt`;
  fs.writeFileSync(tmpPdf, buf);
  try {
    execSync(`pdftotext -layout "${tmpPdf}" "${tmpTxt}" 2>/dev/null`);
    const text = fs.readFileSync(tmpTxt, 'utf8');
    fs.unlinkSync(tmpPdf);
    fs.unlinkSync(tmpTxt);
    return text.length > 200 ? text : null;
  } catch (e) {
    fs.unlinkSync(tmpPdf);
    if (fs.existsSync(tmpTxt)) fs.unlinkSync(tmpTxt);
    return null;
  }
}

async function getTextFromDB(resourceId) {
  // Use the existing ResourceContent if it has text
  const c = await p.resourceContent.findUnique({ where: { resourceId } });
  if (c?.fullText && c.fullText.length > 200) return c.fullText;
  return null;
}

async function extractExercisesMath(num, title, text) {
  if (!text || text.length < 100) return null;
  const nonce = `${num}-${Date.now()}`;
  const system = `Tu es un expert en mathématiques du système éducatif tunisien (lycée 1ère à 4ème année).
Analyse ce document (titre: ${title.slice(0, 120)}) et extrais TOUS les exercices ou parties d'exercices.
Pour CHAQUE exercice/partie: "Exercice N: [sujet/thème court, 5-10 mots] - [résumé FR, 10-20 mots]"
Format strict: commence par "Exercice" puis numéro, puis ":", puis sujet après ":", puis " - " puis résumé.
Exemples valides:
  "Exercice 1: Étude d'une fonction logarithme - Domaine, dérivabilité, limites, tableau de variations."
  "Exercice 2: Géométrie dans l'espace - Calcul de volumes, aires, distances entre points."
  "Exercice 3: Probabilités conditionnelles - Arbre pondéré, événements indépendants, formule de Bayes."
Si le document ne contient pas d'exercices, retourne un JSON vide.
Retourne UNIQUEMENT JSON: {"exercises": ["Exercice 1: ... - ...", ...]}
Limite: 3-12 exercices max (les plus importants).
Nonce: ${nonce}`;

  const resp = await openai.chat.completions.create({
    model: MODEL,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: `---DOC---\n${text.slice(0, 25000)}\n---END---` },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.1,
    max_tokens: 3000,
  });
  const parsed = JSON.parse(resp.choices[0].message.content);
  const ex = parsed.exercises || [];
  return ex.filter(e => e.includes('Exercice') && e.includes(':') && e.includes(' - ') && e.length < 350);
}

async function extractSectionsCourse(num, title, text) {
  if (!text || text.length < 100) return null;
  const nonce = `${num}-${Date.now()}`;
  const system = `Tu es un expert en mathématiques du système éducatif tunisien (lycée 1ère à 4ème année).
Analyse ce COURS (titre: ${title.slice(0, 120)}) et extrais les sous-titres / parties principales du cours.
Pour CHAQUE sous-titre ou partie identifiée dans le document:
  "Nom exact du sous-titre tel qu'il apparaît dans le document: concept mathématique clé résumé en 10-20 mots"
Format strict: PAS de parenthèses, PAS de "Section N" au début, PAS de numérotation. Directement le titre du sous-titre, suivi de ":", puis le résumé.
Exemples valides:
  "Introduction à la statistique: Définition, population, individu, effectif, caractère."
  "Vocabulaire en statistiques: Caractères, classes, effectifs, fréquences et pourcentages."
  "Représentations graphiques: Diagrammes à barres, polygones, histogrammes, circulaires."
  "Paramètres d'un caractère statistique: Position et dispersion, mode, moyenne, médiane."
Si le document ne contient pas de sous-titres clairs, retourne un JSON vide.
Retourne UNIQUEMENT JSON: {"sections": ["Titre du sous-titre: résumé", ...]}
Limite: 3-10 sections max (les plus importantes, dans l'ordre du document).
Nonce: ${nonce}`;

  const resp = await openai.chat.completions.create({
    model: MODEL,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: `---DOC---\n${text.slice(0, 25000)}\n---END---` },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.1,
    max_tokens: 3000,
  });
  const parsed = JSON.parse(resp.choices[0].message.content);
  const sec = parsed.sections || [];
  return sec.filter(s => !s.startsWith('(') && s.includes(':') && s.length < 350);
}

async function processFile(file) {
  const { id, numericId, type, fileKey, title, text_len, method } = file;
  
  // Skip if already done
  if (STATE.done.includes(id)) return { status: 'skipped', id, numericId };
  
  try {
    // 1. Get text
    let text = null;
    if (text_len && text_len > 200) {
      text = await getTextFromDB(id);
    }
    if (!text) {
      text = await getFileText(fileKey);
    }
    
    if (!text || text.length < 200) {
      STATE.skipped.push({ id, numericId, reason: 'no_text' });
      saveState();
      return { status: 'skipped', id, numericId, reason: 'no_text' };
    }
    
    // 2. Call AI
    const insights = type === 'COURSE'
      ? await extractSectionsCourse(numericId, title, text)
      : await extractExercisesMath(numericId, title, text);
    
    if (!insights || insights.length === 0) {
      STATE.failed.push({ id, numericId, reason: 'no_insights' });
      saveState();
      return { status: 'failed', id, numericId, reason: 'no_insights' };
    }
    
    // 3. Save to DB
    await p.resourceMetadata.upsert({
      where: { resourceId: id },
      create: {
        resourceId: id,
        exerciseInsights: insights,
        modelUsed: MODEL_TAG,
        extractedAt: new Date(),
      },
      update: {
        exerciseInsights: insights,
        modelUsed: MODEL_TAG,
        extractedAt: new Date(),
      },
    });
    
    STATE.done.push(id);
    saveState();
    return { status: 'ok', id, numericId, count: insights.length };
  } catch (e) {
    STATE.failed.push({ id, numericId, reason: e.message });
    saveState();
    return { status: 'error', id, numericId, error: e.message };
  }
}

async function main() {
  const all = JSON.parse(fs.readFileSync(BATCH_FILE, 'utf8'));
  console.log(`Total to process: ${all.length}`);
  console.log(`Already done: ${STATE.done.length}`);
  console.log(`Failed: ${STATE.failed.length}`);
  console.log(`Skipped: ${STATE.skipped.length}`);
  console.log(`To do: ${all.length - STATE.done.length - STATE.failed.length - STATE.skipped.length}`);
  console.log(`Concurrency: ${CONCURRENCY}`);
  console.log('---');
  
  const todo = all.filter(f => 
    !STATE.done.includes(f.id) && 
    !STATE.failed.find(x => x.id === f.id) &&
    !STATE.skipped.find(x => x.id === f.id)
  );
  
  console.log(`Starting batch: ${todo.length} files`);
  const startTime = Date.now();
  let processed = 0;
  
  // Process in parallel chunks
  for (let i = 0; i < todo.length; i += CONCURRENCY) {
    const chunk = todo.slice(i, i + CONCURRENCY);
    const results = await Promise.all(chunk.map(f => processFile(f)));
    processed += results.length;
    
    const elapsed = (Date.now() - startTime) / 1000;
    const rate = processed / elapsed;
    const remaining = (todo.length - processed) / rate;
    
    const ok = results.filter(r => r.status === 'ok').length;
    const err = results.filter(r => r.status === 'error').length;
    const skip = results.filter(r => r.status === 'skipped').length;
    
    console.log(`[${processed}/${todo.length}] ok=${ok} err=${err} skip=${skip} | rate=${rate.toFixed(1)}/s | ETA=${Math.round(remaining/60)}min`);
    
    // Show a sample
    if (results.some(r => r.status === 'ok')) {
      const r = results.find(x => x.status === 'ok');
      console.log(`  ✓ #${r.numericId}: ${r.count} insights`);
    }
    if (results.some(r => r.status === 'error')) {
      const r = results.find(x => x.status === 'error');
      console.log(`  ✗ #${r.numericId}: ${r.error?.slice(0, 60)}`);
    }
  }
  
  console.log('---');
  console.log(`✅ Batch complete in ${((Date.now() - startTime) / 1000 / 60).toFixed(1)}min`);
  console.log(`Done: ${STATE.done.length}`);
  console.log(`Failed: ${STATE.failed.length}`);
  console.log(`Skipped: ${STATE.skipped.length}`);
  
  await p.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
