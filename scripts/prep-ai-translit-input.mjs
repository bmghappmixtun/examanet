#!/usr/bin/env node
/**
 * Prepare AI agent input file (2026-08-20)
 * 
 * Output: profs where AR field is Latin, ready for AI transliteration.
 */
import { PrismaClient } from '@prisma/client';
import fs from 'fs';

const p = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL } }
});

const arabicRegex = /[\u0600-\u06FF]/;
const latinRegex = /[a-zA-Z]/;

async function main() {
  // Get all teachers where AR is all Latin
  const teachers = await p.user.findMany({
    where: { role: 'TEACHER' },
    select: { numericId: true, firstName: true, lastName: true, firstNameAr: true, lastNameAr: true, slug: true }
  });
  
  const targets = [];
  for (const t of teachers) {
    const fn = t.firstName || '';
    const ln = t.lastName || '';
    const fnAr = t.firstNameAr || '';
    const lnAr = t.lastNameAr || '';
    
    // AR all Latin in firstNameAr or lastNameAr
    const fnArLatin = fnAr && latinRegex.test(fnAr) && !arabicRegex.test(fnAr);
    const lnArLatin = lnAr && latinRegex.test(lnAr) && !arabicRegex.test(lnAr);
    
    if (fnArLatin || lnArLatin) {
      const url = 'https://examanet.com/fr/professeurs/' + t.numericId;
      const notes = [];
      if (fnArLatin) notes.push('firstNameAr is Latin: "' + fnAr + '"');
      if (lnArLatin) notes.push('lastNameAr is Latin: "' + lnAr + '"');
      targets.push({
        numericId: t.numericId,
        firstName: fn,
        lastName: ln,
        firstNameAr: '',
        lastNameAr: '',
        url,
        note: notes.join('; ')
      });
    }
  }
  
  // Write CSV
  const out = ['numericId,firstName,lastName,firstNameAr,lastNameAr,profileUrl,note'];
  for (const t of targets) {
    out.push([t.numericId, JSON.stringify(t.firstName), JSON.stringify(t.lastName), t.firstNameAr, t.lastNameAr, t.url, t.note].join(','));
  }
  fs.writeFileSync('scripts/ai-translit-input.csv', out.join('\n') + '\n');
  console.log('Wrote scripts/ai-translit-input.csv with', out.length - 1, 'rows');
  console.log('');
  console.log('Header:', out[0]);
  console.log('');
  console.log('First 10:');
  for (const r of out.slice(1, 11)) console.log(' ', r);
}
main().then(() => p.$disconnect()).catch(e => { console.error('💥', e); p.$disconnect(); process.exit(1); });
