#!/usr/bin/env node
/**
 * Audit + fix AR names that are still in Latin (2026-08-21)
 * 
 * Issues found:
 * - 44 profs have firstNameAr = firstName (Latin in both fields)
 * - 2 profs have 1-char AR (#160 "English", #567 "H")
 * - 1 prof has "—" in lastNameAr
 * - 13 profs have AR completely empty
 * - 10 cases of inconsistent AR for same FR
 * 
 * Strategy: for firstNameAr Latin cases, use OpenAI + Groq to get
 * the correct AR transliteration, then apply consensus.
 */
import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import OpenAI from 'openai';

const p = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL } }
});
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const GROQ_API_KEY = process.env.GROQ_API_KEY;

async function callOpenAI(firstName) {
  const prompt = `Translittère ce prénom tunisien du français (Latin) vers l'arabe. Réponds UNIQUEMENT en JSON strict sans markdown: {"firstNameAr": "..."}. Prénom: "${firstName}"`;
  try {
    const r = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      temperature: 0.2,
    });
    return JSON.parse(r.choices[0].message.content).firstNameAr;
  } catch (e) { return null; }
}

async function callGroq(firstName) {
  try {
    const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${GROQ_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'qwen/qwen3.6-27b',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.2,
        response_format: { type: 'json_object' }
      })
    });
    const data = await r.json();
    if (data.error) return null;
    const content = data.choices?.[0]?.message?.content;
    return content ? JSON.parse(content).firstNameAr : null;
  } catch (e) { return null; }
}

async function main() {
  // Read the audit list
  const csv = fs.readFileSync('scripts/audit-ar-latin-firstname.csv', 'utf8');
  const lines = csv.split('\n').filter(Boolean);
  const targets = lines.slice(1).map(l => {
    const parts = l.split(',');
    return { id: parseInt(parts[0]), firstName: parts[1]?.replace(/^"|"$/g, ''), lastName: parts[2]?.replace(/^"|"$/g, '') };
  });
  console.log('Total profs with Latin firstNameAr:', targets.length);
  
  // First, clean the 1-char issues directly
  const oneCharFixes = [
    { id: 160, action: 'lastNameAr=عادل (or just clear)' },
    { id: 567, action: 'lastNameAr=الهادي (from context)' },
  ];
  for (const fix of oneCharFixes) {
    await p.user.updateMany({ where: { numericId: fix.id }, data: { lastNameAr: null } });
    console.log(`Cleaned lastNameAr for #${fix.id}`);
  }
  
  // Now AI-transliterate the firstName for all 44
  const results = [];
  for (let i = 0; i < targets.length; i++) {
    const t = targets[i];
    if (i > 0 && i % 5 === 0) await new Promise(r => setTimeout(r, 500));
    const [openaiRes, groqRes] = await Promise.all([
      callOpenAI(t.firstName),
      callGroq(t.firstName)
    ]);
    const consensus = openaiRes && groqRes && openaiRes === groqRes;
    if (consensus) {
      console.log(`[${i+1}/${targets.length}] #${t.id} ✅ "${t.firstName}" → "${openaiRes}"`);
      results.push({ id: t.id, firstNameAr: openaiRes, consensus: true });
    } else {
      console.log(`[${i+1}/${targets.length}] #${t.id} ⚠️ OpenAI="${openaiRes}" | Groq="${groqRes}"`);
      // Fallback to OpenAI (usually has wider AR support)
      const fallback = openaiRes || groqRes;
      if (fallback) {
        results.push({ id: t.id, firstNameAr: fallback, consensus: false });
      }
    }
  }
  
  const consensusCount = results.filter(r => r.consensus).length;
  console.log('');
  console.log('Consensus:', consensusCount, '/', results.length);
  
  // Apply
  let applied = 0;
  for (const r of results) {
    await p.user.updateMany({
      where: { numericId: r.id },
      data: { firstNameAr: r.firstNameAr }
    });
    applied++;
  }
  console.log('Applied:', applied);
  
  // Save
  fs.writeFileSync('scripts/audit-ar-latin-fix-results.csv', 'numericId,firstName,newFirstNameAr,consensus\n' +
    results.map(r => {
      const t = targets.find(x => x.id === r.id);
      return [r.id, JSON.stringify(t?.firstName || ''), JSON.stringify(r.firstNameAr), r.consensus].join(',');
    }).join('\n') + '\n');
}
main().then(() => p.$disconnect()).catch(e => { console.error('💥', e); p.$disconnect(); process.exit(1); });
