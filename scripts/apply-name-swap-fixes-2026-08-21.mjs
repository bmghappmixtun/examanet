#!/usr/bin/env node
import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import OpenAI from 'openai';

const p = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL } }
});
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function callOpenAI(firstName, lastName) {
  const prompt = `Translittère ce nom tunisien du français (Latin) vers l'arabe. JSON strict: {"firstNameAr": "...", "lastNameAr": "..."}. Si pas de lastName, mets null. Prénom: "${firstName || ''}" Nom: "${lastName || ''}"`;
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

async function main() {
  const csv = fs.readFileSync('scripts/name-swap-fixes-2026-08-21.csv', 'utf8');
  const lines = csv.split('\n').filter(Boolean);
  
  const targets = lines.slice(1).map(l => {
    const parts = l.split(',');
    return { id: parseInt(parts[0]), newName: parts[2]?.replace(/^"|"$/g, ''), count: parseInt(parts[3]) };
  });
  console.log('Total to apply:', targets.length);
  
  let applied = 0, failed = 0;
  for (let i = 0; i < targets.length; i++) {
    const t = targets[i];
    const parts = t.newName.split(/\s+/);
    const newFn = parts[0];
    const newLn = parts.slice(1).join(' ');
    
    const ar = await callOpenAI(newFn, newLn);
    if (!ar) { failed++; continue; }
    
    try {
      await p.user.updateMany({
        where: { numericId: t.id },
        data: {
          firstName: newFn,
          lastName: newLn,
          firstNameAr: ar.firstNameAr || null,
          lastNameAr: ar.lastNameAr || null,
        }
      });
      applied++;
    } catch (e) {
      failed++;
    }
    
    if (i > 0 && i % 20 === 0) {
      console.log('  Progress: ' + i + '/' + targets.length + ' (' + applied + ' applied)');
      await new Promise(r => setTimeout(r, 300));
    }
  }
  console.log('\nApplied: ' + applied + ' / ' + targets.length + ', Failed: ' + failed);
}
main().then(() => p.$disconnect()).catch(e => { console.error('💥', e); p.$disconnect(); process.exit(1); });
