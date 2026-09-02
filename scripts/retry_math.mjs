#!/usr/bin/env node
import { PrismaClient } from '@prisma/client';
import OpenAI from 'openai';
import { config } from 'dotenv';
import fs from 'fs';

config({ path: '/workspace/edutunisie/.env.local' });

const p = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const RETRY_FILE = '/tmp/math_lycee_retry.json';
const STATE_FILE = '/tmp/math_lycee_retry_state.json';
const CONCURRENCY = 5;
const MODEL = 'gpt-4o-mini';
const MODEL_TAG = 'gpt-4o-mini-math-lycee-v2-retry';

const STATE = fs.existsSync(STATE_FILE)
  ? JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'))
  : { done: [], failed: [], skipped: [] };

function saveState() { fs.writeFileSync(STATE_FILE, JSON.stringify(STATE, null, 2)); }

async function getTextFromDB(resourceId) {
  const c = await p.resourceContent.findUnique({ where: { resourceId } });
  return c?.fullText && c.fullText.length > 100 ? c.fullText : null;
}

async function extractExercisesMath(num, title, text) {
  if (!text || text.length < 100) return null;
  const nonce = `${num}-${Date.now()}`;
  // More flexible prompt - allows partial info, lower min
  const system = `Tu es un expert en mathématiques du système éducatif tunisien (lycée 1ère à 4ème année).
Analyse ce document (titre: ${title.slice(0, 120)}) et extrais les exercices ou parties.
Format: "Exercice N: [sujet court] - [résumé 10-20 mots]"
Exemples valides:
  "Exercice 1: Étude de fonction - Domaine, dérivabilité, variations."
  "Exercice 2: Géométrie - Calcul de volumes et distances."
Si le document ne contient pas/peu d'exercices identifiables, retourne 1-3 items génériques mais utiles décrivant le contenu.
Retourne UNIQUEMENT JSON: {"exercises": ["Exercice 1: ... - ...", ...]}
Limite: 1-8 items.
Nonce: ${nonce}`;

  try {
    const resp = await openai.chat.completions.create({
      model: MODEL,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: `---DOC---\n${text.slice(0, 20000)}\n---END---` },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.2,
      max_tokens: 2000,
    });
    const parsed = JSON.parse(resp.choices[0].message.content);
    const ex = parsed.exercises || [];
    return ex.filter(e => e.includes('Exercice') && e.includes(':') && e.includes(' - ') && e.length < 350);
  } catch (e) {
    return null;
  }
}

async function extractSectionsCourse(num, title, text) {
  if (!text || text.length < 100) return null;
  const nonce = `${num}-${Date.now()}`;
  const system = `Tu es un expert en mathématiques du système éducatif tunisien (lycée 1ère à 4ème année).
Analyse ce COURS (titre: ${title.slice(0, 120)}) et extrais les parties/sections.
Format: "Titre exact du sous-titre: concept résumé en 10-20 mots"
Exemples valides:
  "Introduction: Définition, population, individu, caractère."
  "Vocabulaire: Caractères, classes, effectifs."
Si peu de structure, retourne 1-3 items génériques mais utiles.
Retourne UNIQUEMENT JSON: {"sections": ["Titre: résumé", ...]}
Limite: 1-6 items.
Nonce: ${nonce}`;

  try {
    const resp = await openai.chat.completions.create({
      model: MODEL,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: `---DOC---\n${text.slice(0, 20000)}\n---END---` },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.2,
      max_tokens: 2000,
    });
    const parsed = JSON.parse(resp.choices[0].message.content);
    const sec = parsed.sections || [];
    return sec.filter(s => !s.startsWith('(') && s.includes(':') && s.length < 350);
  } catch (e) {
    return null;
  }
}

async function processFile(file) {
  const { id, numericId, type, title } = file;
  if (STATE.done.includes(id)) return { status: 'skipped', id, numericId };
  
  try {
    let text = await getTextFromDB(id);
    if (!text) {
      STATE.skipped.push({ id, numericId, reason: 'no_text' });
      saveState();
      return { status: 'skipped', id, numericId, reason: 'no_text' };
    }
    
    const insights = type === 'COURSE'
      ? await extractSectionsCourse(numericId, title, text)
      : await extractExercisesMath(numericId, title, text);
    
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
  const all = JSON.parse(fs.readFileSync(RETRY_FILE, 'utf8'));
  console.log(`Total to retry: ${all.length}`);
  console.log(`Already done: ${STATE.done.length}`);
  console.log(`Failed: ${STATE.failed.length}`);
  console.log(`Skipped: ${STATE.skipped.length}`);
  console.log(`Concurrency: ${CONCURRENCY}`);
  console.log('---');
  
  const todo = all.filter(f => 
    !STATE.done.includes(f.id) && 
    !STATE.failed.find(x => x.id === f.id) &&
    !STATE.skipped.find(x => x.id === f.id)
  );
  console.log(`To do: ${todo.length}`);
  
  const startTime = Date.now();
  let processed = 0;
  
  for (let i = 0; i < todo.length; i += CONCURRENCY) {
    const chunk = todo.slice(i, i + CONCURRENCY);
    const results = await Promise.all(chunk.map(f => processFile(f)));
    processed += results.length;
    
    const elapsed = (Date.now() - startTime) / 1000;
    const rate = processed / elapsed;
    const remaining = (todo.length - processed) / rate;
    
    const ok = results.filter(r => r.status === 'ok').length;
    const err = results.filter(r => r.status === 'error' || r.status === 'failed').length;
    const skip = results.filter(r => r.status === 'skipped').length;
    
    console.log(`[${processed}/${todo.length}] ok=${ok} err=${err} skip=${skip} | rate=${rate.toFixed(1)}/s | ETA=${Math.round(remaining/60)}min`);
  }
  
  console.log('---');
  console.log(`✅ Done in ${((Date.now() - startTime) / 1000 / 60).toFixed(1)}min`);
  console.log(`Done: ${STATE.done.length}`);
  console.log(`Failed: ${STATE.failed.length}`);
  console.log(`Skipped: ${STATE.skipped.length}`);
  
  await p.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
