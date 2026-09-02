#!/usr/bin/env node
/**
 * Apply AR names from existing profs (2026-08-20)
 * 
 * User feedback 2026-08-19: "verifie parmi les 100 restants
 * s'il y a des noms ou prénoms qu'on a deja leurs versions
 * arabes et les appliquer"
 * 
 * Strategy: For each remaining prof, look up the most common
 * AR transliteration of their firstName and lastName from the
 * existing teacher DB. Only apply if the count is >= 3 (very
 * common, low risk of wrong transliteration).
 */
import { PrismaClient } from '@prisma/client';
import fs from 'fs';
const p = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL } }
});
const arabicRegex = /[\u0600-\u06FF]/;

async function main() {
  // Get ONLY the 100 AR-lang profs
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
  
  // Build lookup with counts
  const fnCounts = new Map();  // firstName → { ar → count }
  const lnCounts = new Map();
  for (const t of allTeachers) {
    const fn = (t.firstName || '').toLowerCase().trim();
    const ln = (t.lastName || '').toLowerCase().trim();
    if (fn) {
      const fnAr = t.firstNameAr || '';
      if (fnAr && arabicRegex.test(fnAr)) {
        if (!fnCounts.has(fn)) fnCounts.set(fn, {});
        fnCounts.get(fn)[fnAr] = (fnCounts.get(fn)[fnAr] || 0) + 1;
      }
    }
    if (ln) {
      const lnAr = t.lastNameAr || '';
      if (lnAr && arabicRegex.test(lnAr)) {
        if (!lnCounts.has(ln)) lnCounts.set(ln, {});
        lnCounts.get(ln)[lnAr] = (lnCounts.get(ln)[lnAr] || 0) + 1;
      }
    }
  }
  
  // For each target, find best match
  const userIds = targets.map(t => t.id);
  const resources = await p.resource.findMany({
    where: { teacherId: { in: userIds }, language: 'ar' },
    select: { teacherId: true }
  });
  const profsWithArLang = new Set(resources.map(r => r.teacherId));
  
  const matches = [];
  const skipped = [];
  for (const t of targets) {
    const fnAr = t.firstNameAr || '';
    const lnAr = t.lastNameAr || '';
    if ((fnAr && arabicRegex.test(fnAr)) || (lnAr && arabicRegex.test(lnAr))) continue;
    if (!profsWithArLang.has(t.id)) continue;
    
    const fn = (t.firstName || '').toLowerCase().trim();
    const ln = (t.lastName || '').toLowerCase().trim();
    
    // Find best AR (most common, count >= 3)
    let newFnAr = null, fnCount = 0;
    if (fn && fnCounts.has(fn)) {
      const sorted = Object.entries(fnCounts.get(fn)).sort((a,b) => b[1] - a[1]);
      if (sorted[0][1] >= 3) { newFnAr = sorted[0][0]; fnCount = sorted[0][1]; }
    }
    let newLnAr = null, lnCount = 0;
    if (ln && lnCounts.has(ln)) {
      const sorted = Object.entries(lnCounts.get(ln)).sort((a,b) => b[1] - a[1]);
      if (sorted[0][1] >= 3) { newLnAr = sorted[0][0]; lnCount = sorted[0][1]; }
    }
    
    if (newFnAr || newLnAr) {
      matches.push({ id: t.numericId, fr: t.firstName + ' ' + t.lastName, newFnAr, fnCount, newLnAr, lnCount });
    } else {
      skipped.push({ id: t.numericId, fr: t.firstName + ' ' + t.lastName });
    }
  }
  
  console.log(`Found ${matches.length} matches (count >= 3)`);
  console.log(`Skipped ${skipped.length} (low count or no match)`);
  console.log('');
  console.log('Will apply:');
  for (const m of matches) {
    console.log(`  #${m.id} | FR: "${m.fr}" | AR: "${m.newFnAr || ''}" "${m.newLnAr || ''}" (counts: ${m.fnCount}/${m.lnCount})`);
  }
  console.log('');
  console.log('Skipped (need AI):');
  for (const s of skipped.slice(0, 20)) console.log(`  #${s.id} | FR: "${s.fr}"`);
  if (skipped.length > 20) console.log('  ... and ' + (skipped.length - 20) + ' more');
  
  // Apply
  let updated = 0;
  for (const m of matches) {
    await p.user.updateMany({
      where: { numericId: m.id },
      data: { firstNameAr: m.newFnAr, lastNameAr: m.newLnAr }
    });
    updated++;
  }
  console.log('');
  console.log('Applied:', updated, '/', matches.length);
}
main().then(() => p.$disconnect()).catch(e => { console.error('💥', e); p.$disconnect(); process.exit(1); });
