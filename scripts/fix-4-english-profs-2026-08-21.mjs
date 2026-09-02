#!/usr/bin/env node
/**
 * Fix 4 English-named profs by using real names from PDFs (2026-08-21)
 * 
 * User feedback 2026-08-20: 'pour ces profs cherche dans leurs pdf
 * vous allez trouver leurs noms'
 * 
 * Findings:
 * - #463 'Park Park' → real prof is 'Moutiaa Moalla Abbes' (Mrs.)
 * - #542 'Bill Bill' → real prof is 'Belhaj' (Mrs. Belhaj)
 * - #528 'Mark Mark' → no prof name in PDF (generic exercise)
 * - #539 'Jackson Jackson' → no prof name in PDF (Jackson is content)
 */
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
  // Real names found in PDFs
  const fixes = [
    { id: 463, firstName: 'Moutiaa', lastName: 'Moalla Abbes' },
    { id: 542, firstName: '', lastName: 'Belhaj' },  // only lastName (Mrs. Belhaj)
    // #528 and #539 have no clear prof name in their PDFs
  ];
  
  for (const fix of fixes) {
    const before = await p.user.findFirst({ where: { numericId: fix.id } });
    if (!before) continue;
    console.log(`\n#${fix.id} BEFORE: firstName="${before.firstName}" lastName="${before.lastName}"`);
    
    // Get AR transliteration
    const result = await callOpenAI(fix.firstName, fix.lastName);
    
    // Update
    await p.user.updateMany({
      where: { numericId: fix.id },
      data: {
        firstName: fix.firstName || null,
        lastName: fix.lastName,
        firstNameAr: result?.firstNameAr || null,
        lastNameAr: result?.lastNameAr || null,
      }
    });
    
    const after = await p.user.findFirst({ where: { numericId: fix.id } });
    console.log(`#${fix.id} AFTER:  firstName="${after?.firstName}" lastName="${after?.lastName}" firstNameAr="${after?.firstNameAr || ''}" lastNameAr="${after?.lastNameAr || ''}"`);
  }
  
  // For #528 and #539, mark them as test accounts (no real name in PDF)
  console.log('\n#528 and #539: NO prof name found in PDF (generic English exercises)');
  console.log('  - These accounts likely have placeholder/test names');
  console.log('  - Keeping as-is (no real name to update)');
}
main().then(() => p.$disconnect()).catch(e => { console.error('💥', e); p.$disconnect(); process.exit(1); });
