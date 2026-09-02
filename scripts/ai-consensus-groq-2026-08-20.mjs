#!/usr/bin/env node
/**
 * AI consensus transliteration - Groq version (2026-08-20)
 * 
 * Strategy: call OpenAI gpt-4o-mini + Groq qwen3-27b in parallel,
 * keep only EXACT matches between the two AIs.
 * 
 * Why Groq instead of Gemini:
 * - 1000 req/day free tier (vs Gemini 20/day)
 * - 30 RPM (vs Gemini 10)
 * - JSON mode works
 * - OpenAI-compatible API
 */
import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import OpenAI from 'openai';

const p = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL } }
});
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const GROQ_API_KEY = process.env.GROQ_API_KEY;

async function callOpenAI(firstName, lastName) {
  const prompt = `Translittère ce nom tunisien du français (Latin) vers l'arabe. JSON: {"firstNameAr": "...", "lastNameAr": "..."}. Si pas de lastName, mets null. Prénom: "${firstName || ''}" Nom: "${lastName || ''}"`;
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

async function callGroq(firstName, lastName) {
  try {
    const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GROQ_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'qwen/qwen3.6-27b',
        messages: [{ role: 'user', content: `Translittère ce nom tunisien du français (Latin) vers l'arabe. Réponds en JSON strict sans markdown: {"firstNameAr": "...", "lastNameAr": "..."}. Si pas de lastName, mets null. Prénom: "${firstName || ''}" Nom: "${lastName || ''}"` }],
        temperature: 0.2,
        response_format: { type: 'json_object' }
      })
    });
    const data = await r.json();
    if (data.error) return null;
    const content = data.choices?.[0]?.message?.content;
    if (!content) return null;
    return JSON.parse(content);
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
    if (i > 0 && i % 10 === 0) await new Promise(r => setTimeout(r, 1000));
    const [openaiRes, groqRes] = await Promise.all([
      callOpenAI(t.firstName, t.lastName),
      callGroq(t.firstName, t.lastName)
    ]);
    const oFirst = openaiRes?.firstNameAr || null;
    const oLast = openaiRes?.lastNameAr || null;
    const gFirst = groqRes?.firstNameAr || null;
    const gLast = groqRes?.lastNameAr || null;
    if (oFirst === gFirst && oLast === gLast && (oFirst || oLast)) {
      console.log(`[${i+1}/${targets.length}] #${t.id} ✅ CONSENSUS: "${oFirst}" "${oLast}"`);
      results.push({ id: t.id, firstNameAr: oFirst, lastNameAr: oLast, consensus: true });
    } else {
      console.log(`[${i+1}/${targets.length}] #${t.id} ⚠️ OpenAI="${oFirst}" "${oLast}" | Groq="${gFirst}" "${gLast}"`);
      results.push({ id: t.id, openai: { firstNameAr: oFirst, lastNameAr: oLast }, groq: { firstNameAr: gFirst, lastNameAr: gLast }, consensus: false });
    }
  }
  
  const consensus = results.filter(r => r.consensus);
  console.log('');
  console.log('=== RESULTS ===');
  console.log('Consensus:', consensus.length, '/', targets.length);
  console.log('No consensus:', targets.length - consensus.length);
  
  // Save
  const outLines = ['numericId,firstName_FR,lastName_FR,firstNameAr,lastNameAr,consensus,openai_first,openai_last,groq_first,groq_last'];
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    const t = targets[i];
    if (r.consensus) {
      outLines.push([t.id, JSON.stringify(t.firstName), JSON.stringify(t.lastName), r.firstNameAr, r.lastNameAr, 'true', r.firstNameAr, r.lastNameAr, r.firstNameAr, r.lastNameAr].join(','));
    } else {
      outLines.push([t.id, JSON.stringify(t.firstName), JSON.stringify(t.lastName), '', '', 'false', r.openai.firstNameAr || '', r.openai.lastNameAr || '', r.groq.firstNameAr || '', r.groq.lastNameAr || ''].join(','));
    }
  }
  fs.writeFileSync('scripts/ai-translit-consensus-groq.csv', outLines.join('\n') + '\n');
  
  // Apply
  let applied = 0;
  for (const r of consensus) {
    await p.user.updateMany({
      where: { numericId: r.id },
      data: { firstNameAr: r.firstNameAr, lastNameAr: r.lastNameAr }
    });
    applied++;
  }
  console.log('Applied:', applied);
}
main().then(() => p.$disconnect()).catch(e => { console.error('💥', e); p.$disconnect(); process.exit(1); });
