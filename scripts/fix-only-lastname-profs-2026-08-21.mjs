#!/usr/bin/env node
/**
 * Phase 2: Fix profs where PDF only has last name (2026-08-21)
 * 
 * User feedback 2026-08-20: 'les autres fichiers ont seulement le Nom
 * du pro (pas de prénom dans l'entete), donc pour ces derniers on
 * garde just le nom (et on met à null le prénom)'
 * 
 * Strategy:
 * 1. For each prof, look at all profNames in metadata
 * 2. If most profNames are SINGLE WORD and that word = current lastName
 * 3. Set firstName/firstNameAr to null
 */
import { PrismaClient } from '@prisma/client';
import fs from 'fs';

const p = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL } }
});

async function main() {
  const profs = await p.user.findMany({
    where: { role: 'TEACHER' },
    select: { id: true, numericId: true, firstName: true, lastName: true, firstNameAr: true, lastNameAr: true, _count: { select: { uploadedFiles: true } } }
  });
  console.log('Total profs:', profs.length);
  
  const userIds = profs.map(t => t.id);
  const resources = await p.resource.findMany({
    where: { teacherId: { in: userIds } },
    select: { 
      teacherId: true, title: true,
      teacherNameAr: true,
      metadata: { select: { profNames: true } },
      content: { select: { fullText: true } }
    }
  });
  
  // Group by prof
  const byProf = new Map();
  for (const r of resources) {
    if (!byProf.has(r.teacherId)) byProf.set(r.teacherId, []);
    byProf.get(r.teacherId).push(r);
  }
  
  // For each prof, find candidate names
  const onlyLastName = [];
  const profsByUserId = new Map(profs.map(t => [t.id, t]));
  
  for (const t of profs) {
    const profResources = byProf.get(t.id) || [];
    
    // Collect all profNames + teacherNameAr occurrences
    const singleWordCounts = new Map(); // single-word prof name → count
    const twoWordCounts = new Map(); // 2-word prof name → count
    
    for (const r of profResources) {
      if (r.metadata?.profNames) {
        for (const n of r.metadata.profNames) {
          const words = n.trim().split(/\s+/);
          if (words.length === 1 && words[0].length >= 3) {
            singleWordCounts.set(words[0], (singleWordCounts.get(words[0]) || 0) + 1);
          } else if (words.length === 2) {
            twoWordCounts.set(n, (twoWordCounts.get(n) || 0) + 1);
          }
        }
      }
      // teacherNameAr
      if (r.teacherNameAr) {
        const words = r.teacherNameAr.trim().split(/\s+/);
        if (words.length === 1) {
          singleWordCounts.set(words[0], (singleWordCounts.get(words[0]) || 0) + 1);
        } else if (words.length === 2) {
          twoWordCounts.set(r.teacherNameAr, (twoWordCounts.get(r.teacherNameAr) || 0) + 1);
        }
      }
    }
    
    const currentFirst = (t.firstName || '').toLowerCase().trim();
    const currentLast = (t.lastName || '').toLowerCase().trim();
    
    // Strategy 1: PDF has only the lastName (matches current lastName)
    // Multiple single-word occurrences, ALL match the lastName
    const singleTotal = [...singleWordCounts.values()].reduce((s, n) => s + n, 0);
    const twoTotal = [...twoWordCounts.values()].reduce((s, n) => s + n, 0);
    
    if (singleTotal > 0 && currentLast) {
      // Count how many single-word names match the current lastName
      const lastNameMatches = singleWordCounts.get(currentLast) || 
                              [...singleWordCounts.entries()].find(([w]) => w.toLowerCase() === currentLast)?.[1] || 0;
      
      // Count how many 2-word names include the lastName
      const twoWithLast = [...twoWordCounts.entries()].filter(([n]) => n.toLowerCase().includes(currentLast)).reduce((s, [_, c]) => s + c, 0);
      
      // If most prof names are single-word and match the lastName,
      // AND there are very few 2-word names, then PDF has only lastName
      if (lastNameMatches >= 2 && lastNameMatches > twoWithLast) {
        onlyLastName.push({ 
          id: t.numericId, 
          currentFr: (t.firstName||'') + ' ' + (t.lastName||''), 
          currentAr: (t.firstNameAr||'') + ' ' + (t.lastNameAr||''),
          pdfEvidence: `lastName matches in ${lastNameMatches} profNames, 2-word: ${twoWithLast}`,
          uploads: t._count.uploadedFiles
        });
      }
    }
  }
  
  console.log('\nProfs where PDF likely has ONLY last name: ' + onlyLastName.length);
  for (const f of onlyLastName.slice(0, 50)) {
    console.log('  #' + f.id + ' | "' + f.currentFr + '" / AR: "' + f.currentAr + '" | uploads: ' + f.uploads + ' | ' + f.pdfEvidence);
  }
  
  // Save
  fs.writeFileSync('scripts/only-lastname-profs-2026-08-21.csv', 'numericId,currentFr,currentAr,uploads,evidence\n' +
    onlyLastName.map(f => [f.id, JSON.stringify(f.currentFr), JSON.stringify(f.currentAr), f.uploads, JSON.stringify(f.pdfEvidence)].join(',')).join('\n') + '\n');
  console.log('\nWrote scripts/only-lastname-profs-2026-08-21.csv');
}
main().then(() => p.$disconnect()).catch(e => { console.error('💥', e); p.$disconnect(); process.exit(1); });
