#!/usr/bin/env node
/**
 * Technologie lycée batch processor (v2 - production)
 * 
 * For each Technologie file in 1ère/2ème/3ème/4ème année:
 * 1. Get text from ResourceContent (if exists) or skip
 * 2. Call OpenAI gpt-4o-mini to generate:
 *    - DEVOIR/EXERCISE: "Exercice N: sujet - résumé" (15-25 mots)
 *    - COURSE: "Titre exact: concept résumé" (10-20 mots)
 * 3. Extract system name (mandatory for DEVOIR/EXERCISE) via:
 *    - Title regex (Machine/Poste/Station/Système de X)
 *    - AI fallback (extract from first 3000 chars of content)
 * 4. Detect specialty (GM/GE) and Dossier technique
 * 5. Save to ResourceMetadata.exerciseInsights + systemName
 * 
 * Concurrency: 5 parallel workers
 * Tags: gpt-4o-mini-tech-lycee-v5-batch
 */
import { PrismaClient } from '@prisma/client';
import OpenAI from 'openai';
import { config } from 'dotenv';
import fs from 'fs';

config({ path: '/workspace/edutunisie/.env.local' });

const p = new PrismaClient();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const BATCH_FILE = '/tmp/tech_lycee_batch.json';
const STATE_FILE = '/tmp/tech_lycee_batch_state.json';
const MODEL = 'gpt-4o-mini';
const MODEL_TAG = 'gpt-4o-mini-tech-lycee-v5-batch';
const CONCURRENCY = 5;

const STATE = fs.existsSync(STATE_FILE)
  ? JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'))
  : { done: [], failed: [], skipped: [] };

function saveState() { fs.writeFileSync(STATE_FILE, JSON.stringify(STATE, null, 2)); }

// ========== SPECIALIZED PROMPTS ==========

const PROMPT_1ERE_2EME_EX = `Tu es un expert en technologie du système éducatif tunisien (lycée 1ère et 2ème année : tronc commun, Sciences, Technologies de l'informatique).
Programme: étude des SYSTÈMES AUTOMATISÉS.

Analyse ce document (titre: {TITLE}) et extrais TOUS les exercices ou parties.

Pour CHAQUE: "Exercice N: [type d'étude] - [résumé FR, 10-25 mots avec vocabulaire technique précis]"

4 GRANDS AXES:
  A. ANALYSE FONCTIONNELLE (bête à cornes, actigramme A-0, A0, fonctions de service)
  B. ANALYSE STRUCTURELLE (actionneurs, pré-actionneurs, capteurs, chaîne fonctionnelle)
  C. GRAFCET (tableau des tâches, niveau 1/2/3)
  D. REPRÉSENTATION GRAPHIQUE (schéma cinématique, projection, cotation)

Exemples:
  "Exercice 1: Analyse fonctionnelle - Compléter la bête à cornes et identifier les fonctions de service."
  "Exercice 2: Structure - Identifier actionneurs, pré-actionneurs et capteurs."
  "Exercice 3: GRAFCET système - Compléter le GRAFCET niveau 1 du cycle."

Si peu d'exercices, retourne 1-3 items génériques utiles.
JSON: {"exercises": ["Exercice 1: ... - ...", ...]}
Limite: 1-8 items.
Nonce: {NONCE}`;

const PROMPT_GM_EX = `Tu es un expert en GÉNIE MÉCANIQUE du système éducatif tunisien (3ème/4ème Sciences Techniques - Génie Mécanique).

Analyse ce document (titre: {TITLE}) et extrais TOUS les exercices.

Pour CHAQUE: "Exercice N: [domaine GM] - [résumé FR, 10-25 mots avec vocabulaire GM]"

GRANDS AXES GM:
  A. ANALYSE FONCTIONNELLE (bête à cornes, CdCF)
  B. ANALYSE STRUCTURELLE (graphe des liaisons, classes d'équivalence, schéma cinématique)
  C. ÉTUDE CINÉMATIQUE (rapports, vitesses, couples, puissances, rendement)
  D. DESSIN TECHNIQUE (projection, cotation fonctionnelle, chaîne de cotes)
  E. RDM (contraintes, déformations, flexion, torsion)
  F. MÉTROLOGIE/FABRICATION (machines-outils, usinage)

Exemples:
  "Exercice 1: Analyse fonctionnelle - Compléter le diagramme pieuvre et rédiger le CdCF."
  "Exercice 2: Graphe des liaisons - Identifier les classes d'équivalence et tracer le graphe."
  "Exercice 3: Schéma cinématique - Compléter le schéma avec symboles normalisés des liaisons."
  "Exercice 4: Cinématique - Calculer le rapport de transmission et la vitesse de sortie."
  "Exercice 5: RDM - Calculer la contrainte et vérifier la condition de résistance."

JSON: {"exercises": ["Exercice 1: ... - ...", ...]}
Limite: 1-8 items.
Nonce: {NONCE}`;

const PROMPT_GE_EX = `Tu es un expert en GÉNIE ÉLECTRIQUE du système éducatif tunisien (3ème/4ème Sciences Techniques - Génie Électrique).

Analyse ce document (titre: {TITLE}) et extrais TOUS les exercices.

Pour CHAQUE: "Exercice N: [domaine GE] - [résumé FR, 10-25 mots avec vocabulaire GE]"

GRANDS AXES GE:
  A. CIRCUITS ÉLECTRIQUES (monophasé, triphasé, lois, puissances)
  B. MACHINES ÉLECTRIQUES (MCC, moteur asynchrone, moteur pas-à-pas)
  C. ÉLECTRONIQUE (A.L.I. en régimes linéaire et saturé, comparateurs)
  D. LOGIQUE (opérations binaires, compteurs, bascules, CI 74xxx)
  E. MICROCONTRÔLEURS (PIC, MikroC, commande moteurs)

Exemples:
  "Exercice 1: Moteur asynchrone - Calculer vitesse de synchronisme, glissement, rendement."
  "Exercice 2: MCC - Étude de la caractéristique n=f(U) et variation de vitesse."
  "Exercice 3: A.L.I. en régime linéaire - Tracer la caractéristique de transfert."
  "Exercice 4: Compteur binaire - Analyser le circuit 74168 et chronogramme."
  "Exercice 5: Microcontrôleur PIC - Écrire le programme MikroC pour commander un moteur."

JSON: {"exercises": ["Exercice 1: ... - ...", ...]}
Limite: 1-8 items.
Nonce: {NONCE}`;

const PROMPT_1ERE_2EME_COURSE = `Tu es un expert en technologie du système éducatif tunisien (lycée 1ère/2ème année).
Analyse ce COURS (titre: {TITLE}) et extrais les sous-titres/parties.

Pour CHAQUE: "Titre exact du sous-titre: concept clé résumé en 10-20 mots"

Programme: Analyse fonctionnelle, Structure (chaîne énergie/info), GRAFCET.

Exemples:
  "Analyse fonctionnelle externe: Identification du besoin, diagramme pieuvre, fonctions de service."
  "Chaîne d'énergie: Alimenter, distribuer, convertir, transmettre."
  "GRAFCET point de vue PC: Équations logiques des étapes et transitions."

JSON: {"sections": ["Titre: résumé", ...]}
Limite: 1-8 sections.
Nonce: {NONCE}`;

const PROMPT_GM_COURSE = `Tu es un expert en GÉNIE MÉCANIQUE du système éducatif tunisien (3ème/4ème Sciences Techniques).
Analyse ce COURS (titre: {TITLE}) et extrais les sous-titres/parties.

Pour CHAQUE: "Titre exact: concept mécanique clé résumé en 10-20 mots"

Programme GM: Analyse fonctionnelle, Structurelle, Cinématique, Dessin technique, RDM, Cotation.

Exemples:
  "Cotation fonctionnelle: Chaîne de cotes, conditions Ja, cotes fonctionnelles."
  "Graphe des liaisons: Représentation plane des liaisons entre classes d'équivalence."

JSON: {"sections": ["Titre: résumé", ...]}
Limite: 1-8 sections.
Nonce: {NONCE}`;

const PROMPT_GE_COURSE = `Tu es un expert en GÉNIE ÉLECTRIQUE du système éducatif tunisien (3ème/4ème Sciences Techniques).
Analyse ce COURS (titre: {TITLE}) et extrais les sous-titres/parties.

Pour CHAQUE: "Titre exact: concept électrique clé résumé en 10-20 mots"

Programme GE: Circuits, Machines électriques, Électronique (A.L.I.), Logique, Microcontrôleurs.

Exemples:
  "Moteur asynchrone triphasé: Constitution, glissement, caractéristiques."
  "A.L.I. en régime saturé: Comparateurs à seuils, trigger de Schmitt."
  "Microcontrôleur PIC 16F877A: Architecture, mémoire, ports E/S, MikroC."

JSON: {"sections": ["Titre: résumé", ...]}
Limite: 1-8 sections.
Nonce: {NONCE}`;

// ========== SYSTEM NAME + SPECIALTY DETECTION ==========

const TITLE_NOISE = [
  /^n°?\s*\d+\s*(er|eme|ème)?\s*$/i,
  /^(devoir|exercice|série|cours|contrôle|synth[èe]se)\s+(de\s+|n°?\s*\d+)/i,
  /^(technologie|techno|g[ée]nie)/i,
  /^(trim(estre)?)\s*\d+/i,
  /^(1ère?\s*ann[ée]e?\s+secondaire?\s*)/i,
  /^(2ème?\s*ann[ée]e?\s+secondaire?\s*)/i,
  /^(3ème?\s*ann[ée]e?\s+secondaire?\s*)/i,
  /^(4ème?\s*ann[ée]e?\s+secondaire?\s*(bac)?\s*)/i,
  /^(as|2018-2019|2019-2020|2020-2021|2021-2022|2022-2023|2023-2024|2024-2025|2025-2026)$/i,
  /^-?\s*$/,
];

const GM_KEYWORDS = [
  'liaison', 'cinématique', 'cotation', 'engrenage', 'poulie', 'courroie', 'bielle', 'came',
  'matériaux', 'rdm', 'contrainte', 'flexion', 'torsion', 'ajustement', 'tolérance',
  "classe d'équivalence", 'graphe des liaisons', 'fraisage', 'tournage', 'perçage',
  'projection orthogonale'
];

const GE_KEYWORDS = [
  'moteur asynchrone', 'mcc', 'moteur à courant', 'microcontrôleur', 'microcontroleur',
  'mikroc', 'pic 16f', 'a.l.i', 'amplificateur', 'comparateur', 'compteur', 'hacheur',
  'moteur pas-à-pas', 'logique combinatoire', 'logique séquentielle', 'monophasé',
  'triphasé', 'facteur de puissance', '74168', 'ci 74', 'circuit intégré'
];

function cleanName(name) {
  return name.replace(/\s+/g, ' ').trim();
}

function isValidName(name) {
  if (!name || name.length < 4 || name.length > 100) return false;
  for (const noise of TITLE_NOISE) {
    if (noise.test(name)) return false;
  }
  if (!/[a-zA-Zà-ÿÀ-Ÿ]{4,}/.test(name)) return false;
  return true;
}

function extractSystemNameFromTitle(title) {
  if (!title) return null;
  const p1 = title.match(/Technologie\s*[:]\s+([^-:]+?)(?:\s*-\s*(?:1AS|2AS|3AS|4AS|1ère|2ème|3ème|4ème|\d)|\s*$)/i);
  if (p1 && isValidName(p1[1])) return cleanName(p1[1]);

  const systemRegex = /(Machine|Poste|Station|Système|Unité|Dispositif|Montage|Installation|Étau|Banc|Maillet|Presse|Pompe|Vérin|Mécanisme|Convoyeur|Robot)\s+(?:de\s+|d'\s*|d\s+)?([^-:]+?)(?:\s*[-:]\s*(?:\d|\(|$|1ère|2ème|3ème|4ème|1AS|2AS|3AS|4AS|Techno|Technologie|Maths|Mathématiques|Physique|SVT|Français|AR|Arabe|Anglais|Histoire|Géographie|Philo|Informatique|Économie|Sciences|Section|Trim|Profil)|\s*$)/i;
  const p2 = title.match(systemRegex);
  if (p2) {
    const name = (p2[1] + ' ' + p2[2]).trim();
    if (isValidName(name)) {
      if (name.length > 80) return cleanName(name.slice(0, 77) + '...');
      return cleanName(name);
    }
  }
  return null;
}

function detectSpecialty(title, text) {
  const titleLower = (title || '').toLowerCase();
  const textLower = (text || '').toLowerCase();
  const gmCount = GM_KEYWORDS.filter(k => titleLower.includes(k) || textLower.includes(k)).length;
  const geCount = GE_KEYWORDS.filter(k => titleLower.includes(k) || textLower.includes(k)).length;
  if (gmCount > geCount && gmCount >= 2) return 'GM';
  if (geCount > gmCount && geCount >= 2) return 'GE';
  return null;
}

async function extractSystemNameFromContent(text) {
  if (!text || text.length < 200) return null;
  const excerpt = text.slice(0, 3000);
  try {
    const resp = await openai.chat.completions.create({
      model: MODEL,
      messages: [
        { role: 'system', content: 'Tu réponds uniquement avec le nom du système, sans phrase ni ponctuation finale.' },
        { role: 'user', content: `Identifie le NOM OFFICIEL du système technique étudié dans ce document éducatif tunisien.
Retourne UNIQUEMENT le nom en français (3-8 mots).
Exemples: "Poste de sertissage", "Station de peinture", "Machine de transfert", "Unité de sciage", "Système de tri automatique", "Étau de modéliste".
Si aucun système identifiable, retourne: "Système non identifié"

TEXTE:
${excerpt.slice(0, 2500)}` },
      ],
      temperature: 0.1,
      max_tokens: 50,
    });
    const name = resp.choices[0].message.content.trim().replace(/^["']|["']$/g, '').replace(/\.$/, '');
    if (name && name.length < 100 && !name.toLowerCase().includes('système non')) {
      return cleanName(name);
    }
  } catch (e) {}
  return null;
}

function getPromptForFile(file) {
  const isCourse = file.type === 'COURSE';
  const is3or4 = file.classSlug === '3eme-secondaire' || file.classSlug === '4eme-secondaire';
  const isTechnique = file.sectionSlug === 'technique';
  
  if (is3or4 && isTechnique) {
    const titleLower = (file.title || '').toLowerCase();
    const isMecanique = /m[ée]cani|cin[ée]mati|cotation|r[ée]sistance|mat[ée]riaux|usinage|fraisage|tournage|per[çc]age/i.test(titleLower);
    const isElectrique = /[ée]lectri|[ée]lectroni|moteur|asynchrone|continu|microcontr[oô]leur|a\.l\.i|circuit|compteur|hacheur/i.test(titleLower);
    if (isMecanique && !isElectrique) {
      return { type: 'GM', ex: PROMPT_GM_EX, course: PROMPT_GM_COURSE };
    } else if (isElectrique && !isMecanique) {
      return { type: 'GE', ex: PROMPT_GE_EX, course: PROMPT_GE_COURSE };
    }
  }
  return { type: '1ère/2ème', ex: PROMPT_1ERE_2EME_EX, course: PROMPT_1ERE_2EME_COURSE };
}

async function getTextFromDB(resourceId) {
  const c = await p.resourceContent.findUnique({ where: { resourceId } });
  return c?.fullText && c.fullText.length > 200 ? c.fullText : null;
}

async function callOpenAI(system, text) {
  try {
    const resp = await openai.chat.completions.create({
      model: MODEL,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: `---DOC---\n${text.slice(0, 20000)}\n---END---` },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.2,
      max_tokens: 2500,
    });
    const parsed = JSON.parse(resp.choices[0].message.content);
    if (parsed.exercises) return parsed.exercises.filter(e => e.includes('Exercice') && e.includes(':') && e.includes(' - ') && e.length < 400);
    if (parsed.sections) return parsed.sections.filter(s => s.includes(':') && s.length < 400);
    return null;
  } catch (e) {
    return null;
  }
}

async function processFile(file) {
  const { id, numericId, type, title } = file;
  if (STATE.done.includes(id)) return { status: 'skipped', id, numericId };
  
  try {
    const text = await getTextFromDB(id);
    if (!text) {
      STATE.skipped.push({ id, numericId, reason: 'no_text' });
      saveState();
      return { status: 'skipped', id, numericId, reason: 'no_text' };
    }
    
    // Determine prompt
    const promptSet = getPromptForFile(file);
    const isCourse = type === 'COURSE';
    const systemTemplate = isCourse ? promptSet.course : promptSet.ex;
    const system = systemTemplate.replace('{TITLE}', title.slice(0, 120)).replace('{NONCE}', `${numericId}-${Date.now()}`);
    
    // Extract system name (mandatory for DEVOIR/EXERCISE)
    let systemName = extractSystemNameFromTitle(title);
    if (!systemName && !isCourse) {
      systemName = await extractSystemNameFromContent(text);
    }
    
    // Call AI for insights
    const insights = await callOpenAI(system, text);
    if (!insights || insights.length === 0) {
      STATE.failed.push({ id, numericId, reason: 'no_insights' });
      saveState();
      return { status: 'failed', id, numericId, reason: 'no_insights' };
    }
    
    // Save to DB
    await p.resourceMetadata.upsert({
      where: { resourceId: id },
      create: {
        resourceId: id,
        exerciseInsights: insights,
        systemName: systemName,
        modelUsed: MODEL_TAG,
        extractedAt: new Date(),
      },
      update: {
        exerciseInsights: insights,
        systemName: systemName,
        modelUsed: MODEL_TAG,
        extractedAt: new Date(),
      },
    });
    
    STATE.done.push(id);
    saveState();
    return { status: 'ok', id, numericId, count: insights.length, systemName, promptType: promptSet.type };
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
    
    // Show 1 sample per chunk
    const sample = results.find(r => r.status === 'ok');
    if (sample) {
      console.log(`  ✓ #${sample.numericId} (${sample.promptType}): ${sample.count} insights, system="${sample.systemName || 'N/A'}"`);
    }
    const errSample = results.find(r => r.status === 'error' || r.status === 'failed');
    if (errSample) {
      console.log(`  ✗ #${errSample.numericId}: ${errSample.error || errSample.reason}`);
    }
  }
  
  console.log('---');
  console.log(`✅ Done in ${((Date.now() - startTime) / 1000 / 60).toFixed(1)}min`);
  console.log(`Done: ${STATE.done.length} | Failed: ${STATE.failed.length} | Skipped: ${STATE.skipped.length}`);
  
  await p.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
