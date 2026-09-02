#!/usr/bin/env node
/**
 * Test Technologie lycée keyInsights generation - META with MANDATORY system name
 * 
 * For DEVOIR/EXERCISE: system name is MANDATORY
 * For COURSE: system name optional
 * 
 * Detection methods:
 * 1. Title regex (Machine, Poste, Station, etc.)
 * 2. AI extraction from content (fallback)
 */
import { PrismaClient } from '@prisma/client';
import OpenAI from 'openai';
import { config } from 'dotenv';
import fs from 'fs';

config({ path: '/workspace/edutunisie/.env.local' });

const p = new PrismaClient();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const TEST_FILE = '/tmp/tech_lycee_test.json';
const MODEL = 'gpt-4o-mini';

// ========== PROMPTS ==========
// (same as before - GM/GE specialized)
const PROMPT_1ERE_2EME_EX = `Tu es un expert en technologie du système éducatif tunisien (lycée 1ère et 2ème année).
Programme officiel: étude des SYSTÈMES AUTOMATISÉS.

Analyse ce document (titre: {TITLE}) et extrais TOUS les exercices ou parties.

Pour CHAQUE exercice/partie: "Exercice N: [type d'étude] - [résumé FR, 10-25 mots]"

4 GRANDS AXES:
  A. ANALYSE FONCTIONNELLE (bête à cornes, actigramme A-0, A0, fonctions de service)
  B. ANALYSE STRUCTURELLE (actionneurs, pré-actionneurs, capteurs, chaîne fonctionnelle)
  C. GRAFCET (tableau des tâches, niveau 1/2/3)
  D. REPRÉSENTATION GRAPHIQUE (schéma cinématique, projection, cotation)

Exemples:
  "Exercice 1: Analyse fonctionnelle - Compléter la bête à cornes et identifier les fonctions de service."
  "Exercice 2: Structure du système - Identifier actionneurs, pré-actionneurs et capteurs."
  "Exercice 3: GRAFCET point de vue système - Compléter le GRAFCET niveau 1 du cycle."

Si peu d'exercices identifiables, retourne 1-3 items génériques utiles.
Retourne UNIQUEMENT JSON: {"exercises": ["Exercice 1: ... - ...", ...]}
Limite: 1-8 items.
Nonce: {NONCE}`;

const PROMPT_GM_EX = `Tu es un expert en GÉNIE MÉCANIQUE du système éducatif tunisien (3ème/4ème Sciences Techniques - Génie Mécanique).

Analyse ce document (titre: {TITLE}) et extrais TOUS les exercices.

Pour CHAQUE: "Exercice N: [domaine GM] - [résumé FR, 10-25 mots avec vocabulaire GM]"

GRANDS AXES en GM:
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

Retourne UNIQUEMENT JSON: {"exercises": ["Exercice 1: ... - ...", ...]}
Limite: 1-8 items.
Nonce: {NONCE}`;

const PROMPT_GE_EX = `Tu es un expert en GÉNIE ÉLECTRIQUE du système éducatif tunisien (3ème/4ème Sciences Techniques - Génie Électrique).

Analyse ce document (titre: {TITLE}) et extrais TOUS les exercices.

Pour CHAQUE: "Exercice N: [domaine GE] - [résumé FR, 10-25 mots avec vocabulaire GE]"

GRANDS AXES en GE:
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

Retourne UNIQUEMENT JSON: {"exercises": ["Exercice 1: ... - ...", ...]}
Limite: 1-8 items.
Nonce: {NONCE}`;

const PROMPT_1ERE_2EME_COURSE = `Tu es un expert en technologie du système éducatif tunisien (lycée 1ère/2ème année).
Analyse ce COURS (titre: {TITLE}) et extrais les sous-titres/parties.

Pour CHAQUE: "Titre exact du sous-titre: concept clé résumé en 10-20 mots"

Programme: Analyse fonctionnelle (bête à cornes, SADT), Structure (chaîne énergie/info), GRAFCET.

Exemples:
  "Analyse fonctionnelle externe: Identification du besoin, diagramme pieuvre."
  "Chaîne d'énergie: Alimenter, distribuer, convertir, transmettre."
  "GRAFCET point de vue PC: Équations logiques des étapes et transitions."

Retourne UNIQUEMENT JSON: {"sections": ["Titre: résumé", ...]}
Limite: 1-8 sections.
Nonce: {NONCE}`;

const PROMPT_GM_COURSE = `Tu es un expert en GÉNIE MÉCANIQUE du système éducatif tunisien (3ème/4ème Sciences Techniques).
Analyse ce COURS (titre: {TITLE}) et extrais les sous-titres/parties.

Pour CHAQUE: "Titre exact: concept mécanique clé résumé en 10-20 mots"

Programme GM: Analyse fonctionnelle, Structurelle, Cinématique, Dessin technique, RDM, Cotation.

Exemples:
  "Cotation fonctionnelle: Chaîne de cotes, conditions Ja, cotes fonctionnelles."
  "Graphe des liaisons: Représentation plane des liaisons entre classes d'équivalence."

Retourne UNIQUEMENT JSON: {"sections": ["Titre: résumé", ...]}
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

Retourne UNIQUEMENT JSON: {"sections": ["Titre: résumé", ...]}
Limite: 1-8 sections.
Nonce: {NONCE}`;

// ========== SYSTEM NAME EXTRACTION ==========

/**
 * Extract system name from title (regex).
 * Common patterns: "Machine de X", "Poste de X", "Station de X", "Système de X", etc.
 */
/**
 * Words that should NEVER be a system name (filler in titles).
 */
const TITLE_NOISE = [
  /^N°?\s*\d+\s*(er|eme|ème)?\s*$/i,  // "N°1", "N° 2", "3eme"
  /^(devoir|exercice|série|cours|contrôle|synth[èe]se)\s+(de\s+|n°?\s*\d+)/i,
  /^(technologie|techno|g[ée]nie)/i,
  /^(trim(estre)?)\s*\d+/i,
  /^(1ère?\s*ann[ée]e?\s+secondaire?\s*)/i,
  /^(2ème?\s*ann[ée]e?\s+secondaire?\s*)/i,
  /^(3ème?\s*ann[ée]e?\s+secondaire?\s*)/i,
  /^(4ème?\s*ann[ée]e?\s+secondaire?\s*(bac)?\s*)/i,
  /^(AS|2018-2019|2019-2020|2020-2021|2021-2022|2022-2023|2023-2024|2024-2025|2025-2026)$/i,
  /^-?\s*$/,
];


function isValidName(name) {
  if (!name || name.length < 4 || name.length > 100) return false;
  for (const noise of TITLE_NOISE) {
    if (noise.test(name)) return false;
  }
  // Must contain at least one meaningful word
  if (!/[a-zA-Zà-ÿÀ-Ÿ]{4,}/.test(name)) return false;
  return true;
}

function extractSystemNameFromTitle(title) {
  if (!title) return null;
  
  // Strategy: scan words between markers
  // Find content between subject marker and class marker
  
  // Pattern 1: "Devoir - SUBJECT - CLASS - SYSTEM (YEAR)"
  // E.g., "Devoir de Contrôle N°1 - Technologie: Poste de sertissage - 1AS ..."
  let m = title.match(/Technologie\s*[:]\s+([^-:]+?)(?:\s*-\s*(?:1AS|2AS|3AS|4AS|1ère|2ème|3ème|4ème|\d)|\s*$)/i);
  if (m && isValidName(m[1])) return cleanName(m[1]);
  
  // Pattern 2: "Machine/Poste/Station/Système/Unité de X" (anywhere in title)
  m = title.match(/(Machine|Poste|Station|Système|Unité|Dispositif|Montage|Installation|[Éé]tau|Banc|Maillet|Presse|Pompe|Vérin|M[ée]canisme|Convoyeur|Robot)\s+(?:de\s+|d'|d’|d\s+)?([^-:]+?)(?:\s*[-:]\s*(?:\d|\(|$|1ère|2ème|3ème|4ème|1AS|2AS|3AS|4AS|Techno|Technologie|Maths|Math[ée]matiques|Physique|SVT|Français|AR|Arabe|Anglais|Histoire|G[ée]ographie|Philo|Informatique|Économie|Sciences|Section|Trim)|\s*$)/i);
  if (m) {
    let name = m[1] + ' ' + m[2];
    if (isValidName(name)) {
      if (name.length > 80) name = name.slice(0, 77) + '...';
      return cleanName(name);
    }
  }
  
  // Pattern 3: "Étude/Maintenance/Contrôle/Réparation de X"
  m = title.match(/(?:[ÉEé]tude|Maintenance|Contr[ôo]le|R[ée]paration|Conception|Fabrication|Production|Assemblage)\s+(?:de\s+|d'|d’|d\s+)?([^-:]+?)(?:\s*[-:]\s*(?:\d|\(|$|1ère|2ème|3ème|4ème|1AS|2AS|3AS|4AS|Techno|Technologie|Maths|Math[ée]matiques|Physique|SVT|Français|AR|Arabe|Anglais|Histoire|G[ée]ographie|Philo|Informatique|Économie|Sciences|Section|Trim)|\s*$)/i);
  if (m && isValidName(m[1])) return cleanName(m[1]);
  
  return null;
}

function cleanName(name) {
  return name.replace(/\s+/g, ' ').trim();
}

/**
 * Extract system name from content using AI.
 * Returns the official name of the studied system in French.
 */
async function extractSystemNameFromContent(text) {
  if (!text || text.length < 200) return null;
  
  // Use first 3000 chars (usually contains intro)
  const excerpt = text.slice(0, 3000);
  
  const system = `Tu es un expert en technologie. Identifie le NOM OFFICIEL du système technique étudié dans ce document éducatif tunisien.
Retourne UNIQUEMENT le nom en français (3-8 mots), sans phrase complète.
Exemples: "Poste de sertissage", "Station de peinture", "Machine de transfert", "Unité de sciage", "Système de tri automatique", "Étau de modéliste".
Si aucun système identifiable, retourne: "Système non identifié"

TITRE: ${excerpt.slice(0, 200)}

TEXTE:
${excerpt.slice(0, 2500)}`;

  try {
    const resp = await openai.chat.completions.create({
      model: MODEL,
      messages: [
        { role: 'system', content: 'Tu réponds uniquement avec le nom du système, sans phrase.' },
        { role: 'user', content: system },
      ],
      temperature: 0.1,
      max_tokens: 50,
    });
    const name = resp.choices[0].message.content.trim().replace(/^["']|["']$/g, '');
    if (name && name.length < 100 && !name.toLowerCase().includes('système non')) {
      return cleanName(name);
    }
  } catch (e) {
    // ignore
  }
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

function detectSpecialty(file, text) {
  const titleLower = (file.title || '').toLowerCase();
  const textLower = (text || '').toLowerCase();
  
  const gmKw = ['liaison', 'cinématique', 'cotation', 'engrenage', 'poulie', 'courroie', 'bielle', 'came', 'matériaux', 'rdm', 'contrainte', 'flexion', 'torsion', 'ajustement', 'tolérance', 'classe d\'équivalence', 'graphe des liaisons', 'fraisage', 'tournage', 'perçage', 'projection orthogonale'];
  const geKw = ['moteur asynchrone', 'mcc', 'moteur à courant', 'microcontrôleur', 'microcontroleur', 'mikroc', 'pic 16f', 'a.l.i', 'amplificateur', 'comparateur', 'compteur', 'hacheur', 'moteur pas-à-pas', 'logique combinatoire', 'logique séquentielle', 'monophasé', 'triphasé', 'facteur de puissance', '74168', 'ci 74', 'circuit intégré'];
  
  const gmCount = gmKw.filter(k => titleLower.includes(k) || textLower.includes(k)).length;
  const geCount = geKw.filter(k => titleLower.includes(k) || textLower.includes(k)).length;
  
  if (gmCount > geCount && gmCount >= 2) return 'GM';
  if (geCount > gmCount && geCount >= 2) return 'GE';
  return null;
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
    if (parsed.sections) return parsed.sections.filter(s => !s.startsWith('(') && s.includes(':') && s.length < 400);
    return null;
  } catch (e) {
    return null;
  }
}

function buildMeta(file, text, systemName, specialty) {
  const meta = [];
  
  // System name is FIRST
  if (systemName) {
    meta.push({ label: systemName, icon: 'wrench', color: 'indigo' });
  }
  
  // Specialty
  if (specialty === 'GM') {
    meta.push({ label: 'Génie Mécanique', icon: 'cog', color: 'slate' });
  } else if (specialty === 'GE') {
    meta.push({ label: 'Génie Électrique', icon: 'zap', color: 'amber' });
  }
  
  // Dossier technique
  if (text && /dossier\s+technique/i.test(text)) {
    meta.push({ label: 'Dossier technique', icon: 'file', color: 'sky' });
  }
  
  return meta;
}

async function main() {
  const files = JSON.parse(fs.readFileSync(TEST_FILE, 'utf8'));
  console.log(`Total test files: ${files.length}\n`);
  
  const results = [];
  for (const f of files) {
    const promptSet = getPromptForFile(f);
    const isCourse = f.type === 'COURSE';
    const systemTemplate = isCourse ? promptSet.course : promptSet.ex;
    const system = systemTemplate.replace('{TITLE}', f.title.slice(0, 120)).replace('{NONCE}', `${f.numericId}-${Date.now()}`);
    
    console.log('━'.repeat(70));
    console.log(`📄 #${f.numericId} (${f.type}) - ${promptSet.type} - ${f.category}`);
    console.log(`   ${f.title.slice(0, 100)}`);
    
    const text = await getTextFromDB(f.id);
    
    // Extract system name (try title first, then AI on content)
    let systemName = extractSystemNameFromTitle(f.title);
    if (!systemName && text && !isCourse) {
      // For DEVOIR/EXERCISE, must extract from content
      console.log('   🔍 Extracting system name from content (AI)...');
      systemName = await extractSystemNameFromContent(text);
    }
    
    const specialty = detectSpecialty(f, text);
    const hasDossier = text && /dossier\s+technique/i.test(text);
    
    console.log(`   🎯 System: ${systemName || '(NOT FOUND)'}`);
    console.log(`   🎯 Specialty: ${specialty || '(ambiguous)'}`);
    console.log(`   🎯 Dossier: ${hasDossier ? 'YES' : 'no'}`);
    
    if (!text) {
      console.log('   ❌ No text\n');
      results.push({ ...f, error: 'no_text', systemName, specialty, hasDossier });
      continue;
    }
    
    const insights = await callOpenAI(system, text);
    const meta = buildMeta(f, text, systemName, specialty);
    
    if (!insights || insights.length === 0) {
      console.log('   ⚠️ No insights returned\n');
      results.push({ ...f, insights: [], promptType: promptSet.type, systemName, specialty, hasDossier, meta });
      continue;
    }
    
    console.log(`\n   📋 Generated ${insights.length} keyInsights (${promptSet.type}):`);
    insights.forEach((ki, i) => console.log(`      ${i + 1}. ${ki}`));
    console.log(`   🎯 META: ${JSON.stringify(meta)}\n`);
    
    results.push({ ...f, insights, promptType: promptSet.type, systemName, specialty, hasDossier, meta });
    await new Promise(r => setTimeout(r, 500));
  }
  
  console.log('━'.repeat(70));
  
  // Summary
  const withInsights = results.filter(r => r.insights?.length).length;
  const withSystem = results.filter(r => r.systemName).length;
  const devoirWithSystem = results.filter(r => r.type !== 'COURSE' && r.systemName).length;
  const devoirTotal = results.filter(r => r.type !== 'COURSE').length;
  
  console.log(`✅ Done.`);
  console.log(`   With insights: ${withInsights}/${results.length}`);
  console.log(`   With system name: ${withSystem}/${results.length}`);
  console.log(`   DEVOIR/EXERCISE with system: ${devoirWithSystem}/${devoirTotal}`);
  
  fs.writeFileSync('/tmp/tech_lycee_test_results.json', JSON.stringify(results, null, 2));
  
  await p.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
