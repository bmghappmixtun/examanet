#!/usr/bin/env node
// Test math lycée keyInsights generation for 3 sample files.
// Uses /api/ai/extract (internal) for PDF text + AI metadata
// Then calls OpenAI gpt-4o-mini directly for the keyInsights format

import { PrismaClient } from '@prisma/client';
import OpenAI from 'openai';
import { config } from 'dotenv';
import fs from 'fs';

config({ path: '/workspace/edutunisie/.env.local' });

const p = new PrismaClient();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const TEST_FILES = [12483, 12234, 12620];
const INTERNAL_TOKEN = process.env.INTERNAL_BULK_TOKEN || 'devmanet-bulk-2026';
const BASE_URL = 'https://examanet.com';

async function getFileText(fileKey) {
  // Use the internal blob API
  const res = await fetch(`${BASE_URL}/api/blob-teacher/${fileKey}`, {
    headers: { 'X-Internal-Token': INTERNAL_TOKEN },
  });
  if (!res.ok) return null;
  const buf = Buffer.from(await res.arrayBuffer());
  // Use a small Python script to extract text
  const tmpPdf = `/tmp/test_${Date.now()}.pdf`;
  const tmpTxt = `/tmp/test_${Date.now()}.txt`;
  fs.writeFileSync(tmpPdf, buf);
  // Use pdftotext if available, else fallback
  try {
    const { execSync } = await import('child_process');
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
    model: 'gpt-4o-mini',
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
    model: 'gpt-4o-mini',
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
  // Accept any line that has a colon, no parenthesis, and reasonable length
  return sec.filter(s => !s.startsWith('(') && s.includes(':') && s.length < 350);
}

async function main() {
  // Use findMany to avoid numericId type issue
  const records = await p.resource.findMany({
    where: {
      numericId: { in: TEST_FILES },
      subject: { slug: 'mathematiques' },
      class: { slug: { in: ['1ere-secondaire', '2eme-secondaire', '3eme-secondaire', '4eme-secondaire'] } },
      status: 'PUBLISHED',
    },
    include: { class: true, section: true },
  });
  const files = records.map(r => ({
    id: r.id,
    numericId: r.numericId,
    title: r.title,
    type: r.type,
    fileKey: r.fileKey,
    fileUrl: r.fileUrl,
    class_name: r.class?.nameFr,
    section_name: r.section?.nameFr,
  })).sort((a, b) => a.numericId - b.numericId);
  
  const results = [];
  for (const f of files) {
    console.log('\n' + '='.repeat(70));
    console.log(`📄 #${f.numericId} (${f.type})`);
    console.log(`   ${f.title}`);
    console.log(`   ${f.class_name} / ${f.section_name || '(no section)'}`);
    console.log('='.repeat(70));
    
    let text;
    try {
      text = await getFileText(f.fileKey);
    } catch (e) {
      console.log(`   ❌ Download failed: ${e.message}`);
      results.push({ ...f, error: e.message });
      continue;
    }
    
    if (!text) {
      console.log(`   ❌ No text extracted (PDF may be scanned)`);
      results.push({ ...f, error: 'no text' });
      continue;
    }
    
    console.log(`   Text: ${text.length} chars`);
    console.log(`   Preview: ${text.slice(0, 200).replace(/\n/g, ' ')}...`);
    
    let insights;
    try {
      insights = f.type === 'COURSE' 
        ? await extractSectionsCourse(f.numericId, f.title, text)
        : await extractExercisesMath(f.numericId, f.title, text);
    } catch (e) {
      console.log(`   ❌ API error: ${e.message}`);
      results.push({ ...f, error: 'api: ' + e.message });
      continue;
    }
    
    if (!insights || insights.length === 0) {
      console.log(`   ⚠️ No insights returned`);
      results.push({ ...f, keyInsights: [], text_len: text.length });
      continue;
    }
    
    console.log(`\n   📋 Generated ${insights.length} keyInsights:`);
    insights.forEach((ki, i) => console.log(`      ${i + 1}. ${ki}`));
    
    results.push({ ...f, keyInsights: insights, text_len: text.length });
    await new Promise(r => setTimeout(r, 1000));
  }
  
  console.log('\n' + '='.repeat(70));
  console.log('✅ Tests complete.');
  console.log(`   Files tested: ${results.length}`);
  console.log(`   Files with keyInsights: ${results.filter(r => r.keyInsights?.length).length}`);
  
  fs.writeFileSync('/tmp/math_lycee_test_results.json', JSON.stringify(results, null, 2));
  console.log(`   Results saved to /tmp/math_lycee_test_results.json`);
  
  await p.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
