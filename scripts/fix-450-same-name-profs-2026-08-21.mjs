#!/usr/bin/env node
/**
 * Fix 450 profs with name=prenom by using PDF-extracted real names (2026-08-21)
 * 
 * User feedback 2026-08-20: 'pour les 50 profs qui ont nom = prénom
 * (en FR ou AR), chercche bien dans leurs pdfs le vrai nom et prénom'
 * 
 * Note: there are actually 450 such profs, not 50.
 * 
 * Strategy: use profNames from ResourceMetadata (AI-extracted from PDFs)
 * which are the most reliable source. Apply if the candidate has 2+ words
 * (firstName + lastName structure).
 */
import { PrismaClient } from '@prisma/client';
import fs from 'fs';

const p = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL } }
});

async function main() {
  // Read the candidates CSV
  const csv = fs.readFileSync('scripts/teachers-same-name-pdf-candidates.csv', 'utf8');
  const lines = csv.split('\n').filter(Boolean);
  const header = lines[0].split(',');
  
  const fixes = [];
  for (const line of lines.slice(1)) {
    // Parse CSV line (handle quoted fields with commas)
    const parts = line.match(/(?:^|,)("(?:[^"]*(?:""[^"]*)*)"|[^,]*)/g)?.map(p => p.replace(/^,/, '').replace(/^"|"$/g, '')) || [];
    if (parts.length < 7) continue;
    
    const id = parseInt(parts[0]);
    const fr = parts[1];
    const ar = parts[2];
    const uploads = parseInt(parts[3]) || 0;
    let profNamesRaw = parts[4];
    let titleNamesRaw = parts[5];
    
    // Parse the candidate names
    let profNames = [];
    try {
      const cleaned = profNamesRaw.replace(/^\[|\]$/g, '');
      if (cleaned) {
        profNames = cleaned.match(/"([^"]+)"/g)?.map(s => s.replace(/^"|"$/g, '')) || [];
      }
    } catch (e) {}
    
    let titleNames = [];
    try {
      const cleaned = titleNamesRaw.replace(/^\[|\]$/g, '');
      if (cleaned) {
        titleNames = cleaned.match(/"([^"]+)"/g)?.map(s => s.replace(/^"|"$/g, '')) || [];
      }
    } catch (e) {}
    
    // Find best candidate (first one with 2+ words, not the prof itself)
    let bestCandidate = null;
    for (const c of [...profNames, ...titleNames]) {
      const words = c.split(/\s+/);
      if (words.length >= 2) {
        // Check if it's different from current name
        const currentWords = (fr + ' ' + ar).toLowerCase();
        if (!currentWords.includes(c.toLowerCase().split(/\s+/)[0].toLowerCase())) {
          bestCandidate = c;
          break;
        }
      }
    }
    
    if (bestCandidate) {
      fixes.push({ id, fr, ar, uploads, newName: bestCandidate, source: profNames.includes(bestCandidate) ? 'profNames' : 'titleNames' });
    }
  }
  
  console.log(`Total fixes to apply: ${fixes.length}`);
  console.log('\nFirst 30 fixes:');
  for (const f of fixes.slice(0, 30)) {
    console.log(`  #${f.id} | "${f.fr}" → "${f.newName}" (uploads: ${f.uploads}, source: ${f.source})`);
  }
  
  // Apply each fix
  let applied = 0;
  for (const f of fixes) {
    const parts = f.newName.split(/\s+/);
    const newFn = parts[0];
    const newLn = parts.slice(1).join(' ');
    try {
      await p.user.updateMany({
        where: { numericId: f.id },
        data: {
          firstName: newFn,
          lastName: newLn,
          firstNameAr: null,  // Will need AI transliteration
          lastNameAr: null,
        }
      });
      applied++;
    } catch (e) {
      console.log(`  Error #${f.id}: ${e.message.substring(0, 60)}`);
    }
  }
  console.log(`\nApplied: ${applied}/${fixes.length}`);
}
main().then(() => p.$disconnect()).catch(e => { console.error('💥', e); p.$disconnect(); process.exit(1); });
