#!/usr/bin/env node
import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import OpenAI from 'openai';

const p = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL } }
});
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function callOpenAI(lastName) {
  // Only transliterate the lastName
  const prompt = `Translittère ce nom de famille tunisien du français (Latin) vers l'arabe. JSON strict: {"lastNameAr": "..."}. Nom: "${lastName}"`;
  try {
    const r = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      temperature: 0.2,
    });
    return JSON.parse(r.choices[0].message.content).lastNameAr;
  } catch (e) { return null; }
}

async function main() {
  const csv = fs.readFileSync('scripts/only-lastname-profs-2026-08-21.csv', 'utf8');
  const lines = csv.split('\n').filter(Boolean);
  
  const targets = lines.slice(1).map(l => {
    const parts = l.split(',');
    return { id: parseInt(parts[0]), currentFr: parts[1]?.replace(/^"|"$/g, ''), uploads: parseInt(parts[3]) };
  });
  console.log('Total to apply:', targets.length);
  
  let applied = 0, failed = 0;
  for (let i = 0; i < targets.length; i++) {
    const t = targets[i];
    
    // Get current prof data
    const prof = await p.user.findFirst({ where: { numericId: t.id } });
    if (!prof) continue;
    
    const lastName = prof.lastName;
    if (!lastName) continue;
    
    // Get AR transliteration of just the lastName
    const lastNameAr = await callOpenAI(lastName);
    if (!lastNameAr) { failed++; continue; }
    
    try {
      // Set firstName and firstNameAr to null
      await p.user.updateMany({
        where: { numericId: t.id },
        data: {
          firstName: null,
          firstNameAr: null,
          // Keep lastName as is, but update lastNameAr
          lastNameAr: lastNameAr,
        }
      });
      applied++;
      if (applied <= 5) {
        console.log('  #' + t.id + ' "' + t.currentFr + '" → firstName=null lastName="' + lastName + '" lastNameAr="' + lastNameAr + '"');
      }
    } catch (e) {
      failed++;
    }
    
    if (i > 0 && i % 10 === 0) {
      console.log('  Progress: ' + i + '/' + targets.length + ' (' + applied + ' applied, ' + failed + ' failed)');
      await new Promise(r => setTimeout(r, 300));
    }
  }
  console.log('\nApplied: ' + applied + ' / ' + targets.length + ', Failed: ' + failed);
}
main().then(() => p.$disconnect()).catch(e => { console.error('💥', e); p.$disconnect(); process.exit(1); });
