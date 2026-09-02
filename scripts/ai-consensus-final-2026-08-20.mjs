#!/usr/bin/env node
/**
 * AI consensus transliteration (2026-08-20)
 * 
 * Strategy: call OpenAI gpt-4o-mini + Gemini in parallel, keep
 * only EXACT matches between the two AIs. Apply consensus to DB.
 * 
 * Gemini auth: query param (works with custom AQ.* keys)
 * Gemini endpoint: /v1 (more reliable than v1beta with custom keys)
 * Gemini JSON: ask for JSON in the prompt (no JSON mode in v1)
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

async function callGemini(firstName, lastName) {
  const url = `https://generativelanguage.googleapis.com/v1/models/gemini-3.6-flash:generateContent?key=${GEMINI_API_KEY}`;
  const prompt = `Translittère ce nom tunisien du français (Latin) vers l'arabe. Réponds UNIQUEMENT en JSON strict avec ce format exact (sans markdown): {"firstNameAr": "...", "lastNameAr": "..."}. Si pas de lastName, mets null. Prénom: "${firstName || ''}" Nom: "${lastName || ''}"`;
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.2 }
      })
    });
    const data = await r.json();
    if (data.error) return null;
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) return null;
    const jsonMatch = text.match(/\{[^}]+\}/);
    if (!jsonMatch) return null;
    return JSON.parse(jsonMatch[0]);
  } catch (e) { return null; }
}

async function main() {
  const csv = fs.readFileSync('scripts/ai-translit-final-input.csv', 'utf8');
  const lines = csv.split('\n').filter(Boolean);
  const targets = lines.slice(1).map(l => {
    const parts = l.split(',');
    return { id: parseInt(parts[0]), firstName: parts[1]?.replace(/^"|"$/g, ''), lastName: parts[2]?.replace(/^"|"$/g, '') };
  });
  
  const results = [];
  for (let i = 0; i < targets.length; i++) {
    const t = targets[i];
    if (i > 0 && i % 5 === 0) await new Promise(r => setTimeout(r, 1000));
    const [openaiRes, geminiRes] = await Promise.all([
      callOpenAI(t.firstName, t.lastName),
      callGemini(t.firstName, t.lastName)
    ]);
    const oFirst = openaiRes?.firstNameAr || null;
    const oLast = openaiRes?.lastNameAr || null;
    const gFirst = geminiRes?.firstNameAr || null;
    const gLast = geminiRes?.lastNameAr || null;
    if (oFirst === gFirst && oLast === gLast && (oFirst || oLast)) {
      console.log(`[${i+1}] #${t.id} CONSENSUS: "${oFirst}" "${oLast}"`);
      results.push({ id: t.id, firstNameAr: oFirst, lastNameAr: oLast, consensus: true });
    } else {
      results.push({ id: t.id, openai: { firstNameAr: oFirst, lastNameAr: oLast }, gemini: { firstNameAr: gFirst, lastNameAr: gLast }, consensus: false });
    }
  }
  
  const consensus = results.filter(r => r.consensus);
  console.log('Consensus:', consensus.length, '/', targets.length);
  
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
