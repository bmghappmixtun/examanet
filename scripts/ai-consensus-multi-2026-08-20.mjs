#!/usr/bin/env node
/**
 * AI consensus transliteration - 3 AIs version (2026-08-20)
 * 
 * Strategy: call OpenAI + Groq + Mistral in parallel,
 * keep only EXACT matches between ALL three AIs.
 * 
 * Why 3 AIs:
 * - Stronger consensus (need all 3 to agree)
 * - Higher quality (any wrong AI gets voted out)
 * - Free, all have JSON mode
 */
import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import OpenAI from 'openai';

const p = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL } }
});
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const MISTRAL_API_KEY = process.env.MISTRAL_API_KEY;

const PROMPT = (fn, ln) => `Translittère ce nom tunisien du français (Latin) vers l'arabe. JSON strict: {"firstNameAr": "...", "lastNameAr": "..."}. Si pas de lastName, mets null. Prénom: "${fn || ''}" Nom: "${ln || ''}"`;

async function callOpenAI(firstName, lastName) {
  try {
    const r = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: PROMPT(firstName, lastName) }],
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
      headers: { 'Authorization': `Bearer ${GROQ_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'qwen/qwen3.6-27b',
        messages: [{ role: 'user', content: PROMPT(firstName, lastName) }],
        temperature: 0.2,
        response_format: { type: 'json_object' }
      })
    });
    const data = await r.json();
    if (data.error) return null;
    const content = data.choices?.[0]?.message?.content;
    return content ? JSON.parse(content) : null;
  } catch (e) { return null; }
}

async function callMistral(firstName, lastName) {
  try {
    const r = await fetch('https://api.mistral.ai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${MISTRAL_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'mistral-small-latest',
        messages: [{ role: 'user', content: PROMPT(firstName, lastName) }],
        temperature: 0.2,
        response_format: { type: 'json_object' }
      })
    });
    const data = await r.json();
    if (data.error) return null;
    const content = data.choices?.[0]?.message?.content;
    return content ? JSON.parse(content) : null;
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
    const [openaiRes, groqRes, mistralRes] = await Promise.all([
      callOpenAI(t.firstName, t.lastName),
      callGroq(t.firstName, t.lastName),
      callMistral(t.firstName, t.lastName)
    ]);
    
    const consensus3 = openaiRes && groqRes && mistralRes &&
                       openaiRes.firstNameAr === groqRes.firstNameAr && openaiRes.firstNameAr === mistralRes.firstNameAr &&
                       openaiRes.lastNameAr === groqRes.lastNameAr && openaiRes.lastNameAr === mistralRes.lastNameAr;
    
    if (consensus3) {
      console.log(`[${i+1}] #${t.id} ✅ 3-AI CONSENSUS: "${openaiRes.firstNameAr}" "${openaiRes.lastNameAr}"`);
      results.push({ id: t.id, firstNameAr: openaiRes.firstNameAr, lastNameAr: openaiRes.lastNameAr, level: 3 });
    } else {
      const consensus2 = (openaiRes && groqRes && openaiRes.firstNameAr === groqRes.firstNameAr && openaiRes.lastNameAr === groqRes.lastNameAr) ||
                         (openaiRes && mistralRes && openaiRes.firstNameAr === mistralRes.firstNameAr && openaiRes.lastNameAr === mistralRes.lastNameAr) ||
                         (groqRes && mistralRes && groqRes.firstNameAr === mistralRes.firstNameAr && groqRes.lastNameAr === mistralRes.lastNameAr);
      if (consensus2) {
        console.log(`[${i+1}] #${t.id} ✓ 2-AI consensus: OpenAI=${JSON.stringify(openaiRes)} | Groq=${JSON.stringify(groqRes)} | Mistral=${JSON.stringify(mistralRes)}`);
      } else {
        console.log(`[${i+1}] #${t.id} ✗ no consensus`);
      }
      results.push({ id: t.id, openai: openaiRes, groq: groqRes, mistral: mistralRes, level: consensus2 ? 2 : 0 });
    }
  }
  
  const c3 = results.filter(r => r.level === 3);
  const c2 = results.filter(r => r.level === 2);
  console.log('');
  console.log('=== RESULTS ===');
  console.log('3-AI consensus:', c3.length, '/', targets.length);
  console.log('2-AI consensus:', c2.length, '/', targets.length);
  
  // Save
  const outLines = ['numericId,firstName_FR,lastName_FR,firstNameAr,lastNameAr,consensus_level,openai_first,openai_last,groq_first,groq_last,mistral_first,mistral_last'];
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    const t = targets[i];
    if (r.level === 3) {
      outLines.push([t.id, JSON.stringify(t.firstName), JSON.stringify(t.lastName), r.firstNameAr, r.lastNameAr, '3', r.firstNameAr, r.lastNameAr, r.firstNameAr, r.lastNameAr, r.firstNameAr, r.lastNameAr].join(','));
    } else {
      outLines.push([t.id, JSON.stringify(t.firstName), JSON.stringify(t.lastName), '', '', r.level.toString(), r.openai?.firstNameAr || '', r.openai?.lastNameAr || '', r.groq?.firstNameAr || '', r.groq?.lastNameAr || '', r.mistral?.firstNameAr || '', r.mistral?.lastNameAr || ''].join(','));
    }
  }
  fs.writeFileSync('scripts/ai-translit-consensus-multi.csv', outLines.join('\n') + '\n');
  
  // Apply 3-AI consensus
  let applied = 0;
  for (const r of c3) {
    await p.user.updateMany({
      where: { numericId: r.id },
      data: { firstNameAr: r.firstNameAr, lastNameAr: r.lastNameAr }
    });
    applied++;
  }
  console.log('Applied (3-AI):', applied);
}
main().then(() => p.$disconnect()).catch(e => { console.error('💥', e); p.$disconnect(); process.exit(1); });
