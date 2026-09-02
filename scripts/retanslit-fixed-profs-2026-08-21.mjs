#!/usr/bin/env node
/**
 * Re-transliterate the 92 fixed profs to AR (2026-08-21)
 */
import { PrismaClient } from '@prisma/client';
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
  // Get profs with no AR (just fixed, AR was cleared)
  const profs = await p.user.findMany({
    where: { 
      role: 'TEACHER',
      OR: [
        { firstNameAr: null },
        { lastNameAr: null }
      ]
    },
    select: { numericId: true, firstName: true, lastName: true, firstNameAr: true, lastNameAr: true }
  });
  
  // Filter: only those with firstName + lastName set (and uploaded files)
  const targets = await Promise.all(profs.map(async t => {
    if (!t.firstName && !t.lastName) return null;
    const c = await p.resource.count({ where: { teacherId: { equals: undefined }, teacher: { numericId: t.numericId } } });
    return c > 0 ? t : null;
  }));
  const real = targets.filter(Boolean);
  
  console.log('Profs to transliterate:', real.length);
  
  let applied = 0, failed = 0;
  for (let i = 0; i < real.length; i++) {
    const t = real[i];
    if (i > 0 && i % 5 === 0) await new Promise(r => setTimeout(r, 500));
    const result = await callOpenAI(t.firstName, t.lastName);
    if (result && (result.firstNameAr || result.lastNameAr)) {
      await p.user.updateMany({
        where: { numericId: t.numericId },
        data: { firstNameAr: result.firstNameAr || null, lastNameAr: result.lastNameAr || null }
      });
      applied++;
      if (applied <= 20) {
        console.log(`  #${t.numericId} "${t.firstName} ${t.lastName}" → "${result.firstNameAr || ''}" "${result.lastNameAr || ''}"`);
      }
    } else {
      failed++;
    }
  }
  console.log(`\nApplied: ${applied}, Failed: ${failed}`);
}
main().then(() => p.$disconnect()).catch(e => { console.error('💥', e); p.$disconnect(); process.exit(1); });
