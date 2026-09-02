#!/usr/bin/env node
/**
 * AI consensus transliteration - retry with gemini-3.6-flash (2026-08-20)
 * 
 * Earlier attempt used gemini-2.5-flash (free tier quota exhausted).
 * Switched to gemini-3.6-flash (works with the key).
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
  } catch (e) { return null; }
}

async function callGemini(firstName, lastName) {
  const url = `https://generativelanguage.googleapis.com/v1/models/gemini-3.6-flash:generateContent?key=${GEMINI_API_KEY}`;
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
    if (data.error) return null;
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) return null;
    return JSON.parse(text);
  } catch (e) { return null; }
}

async function main() {
  const csv = fs.readFileSync('scripts/ai-translit-final-input.csv', 'utf8');
  const lines = csv.split('\n').filter(Boolean);
  const targets = lines.slice(1).map(l => {
    const parts = l.split(',');
    return { id: parseInt(parts[0]), firstName: parts[1]?.replace(/^"|"$/g, ''), lastName: parts[2]?.replace(/^"|"$/g, '') };
  });
  console.log('Total targets:', targets.length);
  
  const results = [];
  for (let i = 0; i < targets.length; i++) {
    const t = targets[i];
    console.log(`[${i+1}/${targets.length}] #${t.id} "${t.firstName}" "${t.lastName}"`);
    
    const [openaiRes, geminiRes] = await Promise.all([
      callOpenAI(t.firstName, t.lastName),
      callGemini(t.firstName, t.lastName)
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
  
  const consensus = results.filter(r => r.consensus);
  console.log('');
  console.log('=== RESULTS ===');
  console.log('Consensus:', consensus.length, '/', targets.length);
  console.log('No consensus:', targets.length - consensus.length);
  console.log('');
  console.log('Consensus examples:');
  for (const c of consensus.slice(0, 20)) {
    console.log(`  #${c.id}: firstNameAr="${c.firstNameAr}" lastNameAr="${c.lastNameAr}"`);
  }
  
  // Save
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
  fs.writeFileSync('scripts/ai-translit-consensus-v2.csv', outLines.join('\n') + '\n');
  console.log('\\nWrote scripts/ai-translit-consensus-v2.csv');
  
  // Apply consensus only
  let applied = 0;
  for (const r of consensus) {
    await p.user.updateMany({
      where: { numericId: r.id },
      data: { firstNameAr: r.firstNameAr, lastNameAr: r.lastNameAr }
    });
    applied++;
  }
  console.log('Applied consensus:', applied);
}
main().then(() => p.$disconnect()).catch(e => { console.error('💥', e); p.$disconnect(); process.exit(1); });
