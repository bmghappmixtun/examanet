#!/usr/bin/env node
/**
 * AI consensus transliteration (2026-08-20)
 * 
 * User feedback 2026-08-19:
 * "POUR L'API AI : TU UTILISE GOOGLE GEMINI ET OPENAI ET
 * TU PRENDS JUSTE LE NOMS AR s'il est généré exactement le
 * meme par les 2 ai agents."
 * 
 * Strategy:
 * 1. Run OpenAI gpt-4o-mini on each prof
 * 2. Run Gemini 2.5 Flash on each prof
 * 3. Keep only the matches (consensus = exact same AR name)
 * 4. Apply consensus to DB
 */
import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import OpenAI from 'openai';

const p = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL } }
});

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

async function callOpenAI(firstName, lastName) {
  const prompt = `Translittère ce nom tunisien du français (Latin) vers l'arabe. Réponds UNIQUEMENT avec un objet JSON: {"firstNameAr": "...", "lastNameAr": "..."}. Si pas de lastName, mets null. Ne mets PAS de préfixe ال sauf si c'est le nom de famille.

Prénom: "${firstName || ''}"
Nom: "${lastName || ''}"`;
  try {
    const r = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      temperature: 0.2,
    });
    return JSON.parse(r.choices[0].message.content);
  } catch (e) {
    console.error('  OpenAI error:', e.message.substring(0, 100));
    return null;
  }
}

async function callGemini(firstName, lastName) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;
  const prompt = `Translittère ce nom tunisien du français (Latin) vers l'arabe. Réponds UNIQUEMENT avec un objet JSON: {"firstNameAr": "...", "lastNameAr": "..."}. Si pas de lastName, mets null. Ne mets PAS de préfixe ال sauf si c'est le nom de famille.

Prénom: "${firstName || ''}"
Nom: "${lastName || ''}"`;
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: 'application/json', temperature: 0.2 }
      })
    });
    const data = await r.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) return null;
    return JSON.parse(text);
  } catch (e) {
    console.error('  Gemini error:', e.message.substring(0, 100));
    return null;
  }
}

async function main() {
  const csv = fs.readFileSync('scripts/ai-translit-final-input.csv', 'utf8');
  const lines = csv.split('\n').filter(Boolean);
  const header = lines[0].split(',');
  const targets = lines.slice(1).map(l => {
    const parts = l.split(',');
    return { id: parseInt(parts[0]), firstName: parts[1]?.replace(/^"|"$/g, ''), lastName: parts[2]?.replace(/^"|"$/g, '') };
  });
  console.log('Total targets:', targets.length);
  
  const results = [];
  for (let i = 0; i < targets.length; i++) {
    const t = targets[i];
    const fn = t.firstName || '';
    const ln = t.lastName || '';
    console.log(`[${i+1}/${targets.length}] #${t.id} "${fn}" "${ln}"`);
    
    const [openaiRes, geminiRes] = await Promise.all([
      callOpenAI(fn, ln),
      callGemini(fn, ln)
    ]);
    
    const oFirst = openaiRes?.firstNameAr || null;
    const oLast = openaiRes?.lastNameAr || null;
    const gFirst = geminiRes?.firstNameAr || null;
    const gLast = geminiRes?.lastNameAr || null;
    
    const firstMatch = oFirst === gFirst;
    const lastMatch = oLast === gLast;
    
    if (firstMatch && lastMatch && (oFirst || oLast)) {
      console.log(`  ✅ CONSENSUS: firstNameAr="${oFirst}" lastNameAr="${oLast}"`);
      results.push({ id: t.id, firstNameAr: oFirst, lastNameAr: oLast, consensus: true });
    } else {
      console.log(`  ⚠️ NO CONSENSUS: OpenAI="${oFirst}" "${oLast}" | Gemini="${gFirst}" "${gLast}"`);
      results.push({ id: t.id, openai: { firstNameAr: oFirst, lastNameAr: oLast }, gemini: { firstNameAr: gFirst, lastNameAr: gLast }, consensus: false });
    }
  }
  
  // Stats
  const consensus = results.filter(r => r.consensus);
  const noConsensus = results.filter(r => !r.consensus);
  console.log('');
  console.log('=== RESULTS ===');
  console.log('Consensus:', consensus.length);
  console.log('No consensus:', noConsensus.length);
  console.log('');
  
  // Save results
  const outLines = ['numericId,firstName_FR,lastName_FR,firstNameAr,lastNameAr,consensus,openai_first,openai_last,gemini_first,gemini_last'];
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    const t = targets[i];
    if (r.consensus) {
      outLines.push([t.id, JSON.stringify(t.firstName), JSON.stringify(t.lastName), r.firstNameAr, r.lastNameAr, 'true', r.firstNameAr, r.lastNameAr, r.firstNameAr, r.lastNameAr].join(','));
    } else {
      outLines.push([t.id, JSON.stringify(t.firstName), JSON.stringify(t.lastName), '', '', 'false', r.openai.firstNameAr || '', r.openai.lastNameAr || '', r.gemini.firstNameAr || '', r.gemini.lastNameAr || ''].join(','));
    }
  }
  fs.writeFileSync('scripts/ai-translit-consensus.csv', outLines.join('\n') + '\n');
  console.log('Wrote scripts/ai-translit-consensus.csv');
  
  // Apply consensus to DB
  let applied = 0;
  for (const r of consensus) {
    await p.user.updateMany({
      where: { numericId: r.id },
      data: { firstNameAr: r.firstNameAr, lastNameAr: r.lastNameAr }
    });
    applied++;
  }
  console.log('');
  console.log('Applied consensus to DB:', applied);
}
main().then(() => p.$disconnect()).catch(e => { console.error('💥', e); p.$disconnect(); process.exit(1); });
