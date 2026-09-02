#!/usr/bin/env node
/**
 * Process the 31 re-classified SUMMARY→COURSE files
 * Uses the same logic as math_lycee_batch.mjs but for a smaller list
 */
import { PrismaClient } from '@prisma/client';
import OpenAI from 'openai';
import { config } from 'dotenv';
import fs from 'fs';

config({ path: '/workspace/edutunisie/.env.local' });

const p = new PrismaClient();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const BATCH_FILE = '/tmp/math_lycee_summary_fix.json';
const STATE_FILE = '/tmp/math_lycee_summary_fix_state.json';
const MODEL = 'gpt-4o-mini';
const MODEL_TAG = 'gpt-4o-mini-math-lycee-v3-summary';

const STATE = fs.existsSync(STATE_FILE)
  ? JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'))
  : { done: [], failed: [], skipped: [] };

function saveState() { fs.writeFileSync(STATE_FILE, JSON.stringify(STATE, null, 2)); }

async function getTextFromDB(resourceId) {
  const c = await p.resourceContent.findUnique({ where: { resourceId } });
  return c?.fullText && c.fullText.length > 100 ? c.fullText : null;
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
  const { id, numericId, title } = file;
  if (STATE.done.includes(id)) return { status: 'skipped', id, numericId };
  
  try {
    let text = await getTextFromDB(id);
    if (!text) {
      STATE.skipped.push({ id, numericId, reason: 'no_text' });
      saveState();
      return { status: 'skipped', id, numericId, reason: 'no_text' };
    }
    
    const insights = await extractSectionsCourse(numericId, title, text);
    if (!insights || insights.length === 0) {
      STATE.failed.push({ id, numericId, reason: 'no_insights' });
      saveState();
      return { status: 'failed', id, numericId, reason: 'no_insights' };
    }
    
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
  console.log('Total: ' + all.length);
  console.log('Already done: ' + STATE.done.length);
  
  const todo = all.filter(f => 
    !STATE.done.includes(f.id) && 
    !STATE.failed.find(x => x.id === f.id) &&
    !STATE.skipped.find(x => x.id === f.id)
  );
  console.log('To do: ' + todo.length);
  console.log('---');
  
  const startTime = Date.now();
  let processed = 0;
  
  // Process serially (only 31 files)
  for (const file of todo) {
    const r = await processFile(file);
    processed++;
    console.log(`[${processed}/${todo.length}] ${r.status} #${r.numericId}` + (r.count ? ` (${r.count} insights)` : '') + (r.error ? `: ${r.error}` : ''));
  }
  
  console.log('---');
  console.log(`✅ Done in ${((Date.now() - startTime) / 1000).toFixed(1)}s`);
  console.log(`Done: ${STATE.done.length} / Failed: ${STATE.failed.length} / Skipped: ${STATE.skipped.length}`);
  
  await p.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
