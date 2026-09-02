#!/usr/bin/env node
/**
 * Fix 3 audit categories (2026-08-21):
 * 1. "el" firstName profs (3) → set firstName/firstNameAr to null (data corruption)
 * 2. Empty AR profs (13) → AI transliterate the FR names (except English ones)
 */
import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import OpenAI from 'openai';

const p = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL } }
});
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const ENGLISH_NAMES = ['Park', 'Mark', 'Bill', 'Jackson', 'English'];

async function callOpenAI(firstName, lastName) {
  const prompt = `Translittère ce nom tunisien du français (Latin) vers l'arabe. Réponds UNIQUEMENT en JSON strict sans markdown: {"firstNameAr": "...", "lastNameAr": "..."}. Si pas de lastName, mets null. Prénom: "${firstName || ''}" Nom: "${lastName || ''}"`;
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
  // ============================================
  // 1. Fix "el" firstName profs
  // ============================================
  console.log('=== 1. Fix "el" firstName profs ===');
  const elIds = [632, 1544, 1676];
  for (const id of elIds) {
    const t = await p.user.findFirst({ where: { numericId: id } });
    if (t) {
      console.log(`  #${id} BEFORE: firstName="${t.firstName}" firstNameAr="${t.firstNameAr || ''}" lastName="${t.lastName}" lastNameAr="${t.lastNameAr || ''}"`);
      // Set firstName and firstNameAr to null (data corruption)
      await p.user.updateMany({
        where: { numericId: id },
        data: { firstName: null, firstNameAr: null }
      });
      const after = await p.user.findFirst({ where: { numericId: id } });
      console.log(`  #${id} AFTER:  firstName="${after?.firstName || ''}" firstNameAr="${after?.firstNameAr || ''}" lastName="${after?.lastName}" lastNameAr="${after?.lastNameAr || ''}"`);
    }
  }
  
  // ============================================
  // 2. Fix empty AR profs (only non-English ones)
  // ============================================
  console.log('\n=== 2. AI transliterate empty AR profs ===');
  const emptyArIds = [463, 461, 528, 539, 532, 533, 90, 534, 548, 542, 659, 699, 728];
  let transliterated = 0, skipped = 0;
  for (const id of emptyArIds) {
    const t = await p.user.findFirst({ where: { numericId: id } });
    if (!t) continue;
    
    // Skip if name is English-only
    const isEnglish = ENGLISH_NAMES.includes(t.firstName) || ENGLISH_NAMES.includes(t.lastName);
    if (isEnglish) {
      console.log(`  #${id} SKIP (English name): "${t.firstName}" "${t.lastName}"`);
      skipped++;
      continue;
    }
    
    const result = await callOpenAI(t.firstName, t.lastName);
    if (result && (result.firstNameAr || result.lastNameAr)) {
      await p.user.updateMany({
        where: { numericId: id },
        data: {
          firstNameAr: result.firstNameAr || null,
          lastNameAr: result.lastNameAr || null
        }
      });
      console.log(`  #${id} APPLIED: "${t.firstName}" "${t.lastName}" → "${result.firstNameAr || ''}" "${result.lastNameAr || ''}"`);
      transliterated++;
    } else {
      console.log(`  #${id} FAILED: "${t.firstName}" "${t.lastName}"`);
    }
  }
  
  console.log(`\nTransliterated: ${transliterated}, Skipped: ${skipped}`);
}
main().then(() => p.$disconnect()).catch(e => { console.error('💥', e); p.$disconnect(); process.exit(1); });
