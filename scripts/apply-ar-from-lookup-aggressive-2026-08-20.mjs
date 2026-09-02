#!/usr/bin/env node
/**
 * Apply AR names from any single match (2026-08-20)
 * 
 * User feedback 2026-08-19: "MEME si le nom a un seul homologue
 * en fr on applique la version ar"
 * 
 * Same as previous script but with count >= 1 (no threshold).
 */
import { PrismaClient } from '@prisma/client';
import fs from 'fs';
const p = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL } }
});
const arabicRegex = /[\u0600-\u06FF]/;

async function main() {
  // Get the 365 profs (from CSV)
  const csv = fs.readFileSync('scripts/ai-translit-input.csv', 'utf8');
  const lines = csv.split('\n').filter(Boolean);
  const targetIds = lines.slice(1).map(l => parseInt(l.split(',')[0])).filter(Boolean);
  
  const targets = await p.user.findMany({
    where: { role: 'TEACHER', numericId: { in: targetIds } },
    select: { id: true, numericId: true, firstName: true, lastName: true, firstNameAr: true, lastNameAr: true }
  });
  
  // Get all teachers with AR
  const allTeachers = await p.user.findMany({
    where: { role: 'TEACHER' },
    select: { firstName: true, lastName: true, firstNameAr: true, lastNameAr: true }
  });
  
  // Build lookup (first match only)
  const fnLookup = new Map();  // firstName → firstNameAr
  const lnLookup = new Map();  // lastName → lastNameAr
  for (const t of allTeachers) {
    const fn = (t.firstName || '').toLowerCase().trim();
    const ln = (t.lastName || '').toLowerCase().trim();
    if (fn && !fnLookup.has(fn)) {
      const fnAr = t.firstNameAr || '';
      if (fnAr && arabicRegex.test(fnAr)) fnLookup.set(fn, fnAr);
    }
    if (ln && !lnLookup.has(ln)) {
      const lnAr = t.lastNameAr || '';
      if (lnAr && arabicRegex.test(lnAr)) lnLookup.set(ln, lnAr);
    }
  }
  
  // For each target, find match
  let updated = 0;
  const examples = [];
  const skipped = [];
  for (const t of targets) {
    const fnAr = t.firstNameAr || '';
    const lnAr = t.lastNameAr || '';
    if ((fnAr && arabicRegex.test(fnAr)) || (lnAr && arabicRegex.test(lnAr))) continue;
    
    const fn = (t.firstName || '').toLowerCase().trim();
    const ln = (t.lastName || '').toLowerCase().trim();
    const newFnAr = fnLookup.get(fn) || null;
    const newLnAr = lnLookup.get(ln) || null;
    
    if (newFnAr || newLnAr) {
      await p.user.updateMany({
        where: { numericId: t.numericId },
        data: { firstNameAr: newFnAr, lastNameAr: newLnAr }
      });
      updated++;
      if (examples.length < 30) examples.push({ id: t.numericId, fr: t.firstName + ' ' + t.lastName, newFnAr, newLnAr });
    } else {
      skipped.push({ id: t.numericId, fr: t.firstName + ' ' + t.lastName });
    }
  }
  
  console.log('Applied:', updated);
  console.log('Still skipped:', skipped.length);
  console.log('');
  console.log('Examples:');
  for (const e of examples.slice(0, 20)) {
    console.log('  #' + e.id + ' | FR: \"' + e.fr + '\" → AR: \"' + (e.newFnAr || '') + '\" \"' + (e.newLnAr || '') + '\"');
  }
  if (skipped.length > 0) {
    console.log('\\nStill need AI:');
    for (const s of skipped.slice(0, 30)) console.log('  #' + s.id + ' | ' + s.fr);
  }
}
main().then(() => p.$disconnect()).catch(e => { console.error('💥', e); p.$disconnect(); process.exit(1); });
