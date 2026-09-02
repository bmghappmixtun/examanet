#!/usr/bin/env node
/**
 * Extract more candidates from fullText and metadata (2026-08-21)
 * 
 * User feedback 2026-08-20: 'Continue à creuser les 300 restants
 * (aller plus loin dans le fullText, regex plus précises)'
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
  
  const sameNames = profs.filter(t => {
    const fr = t.firstName && t.lastName && t.firstName.toLowerCase() === t.lastName.toLowerCase();
    const ar = t.firstNameAr && t.lastNameAr && t.firstNameAr === t.lastNameAr;
    return fr || ar;
  });
  console.log('Same-name profs to scan:', sameNames.length);
  
  const userIds = sameNames.map(t => t.id);
  
  // Get resources in batches
  const batchSize = 100;
  const candidatesMap = new Map();
  
  for (let i = 0; i < userIds.length; i += batchSize) {
    const batch = userIds.slice(i, i + batchSize);
    const resources = await p.resource.findMany({
      where: { teacherId: { in: batch } },
      select: { 
        teacherId: true, title: true,
        teacherNameAr: true, schoolName: true,
        metadata: { select: { profNames: true, exerciseInsights: true, keyInsights: true } },
        content: { select: { fullText: true } }
      }
    });
    
    for (const r of resources) {
      if (!candidatesMap.has(r.teacherId)) candidatesMap.set(r.teacherId, new Map());
      const cand = candidatesMap.get(r.teacherId);
      
      // profNames (weight 3)
      if (r.metadata?.profNames) {
        for (const n of r.metadata.profNames) {
          if (n && n.length >= 3 && n.length < 50) {
            cand.set(n, (cand.get(n) || 0) + 3);
          }
        }
      }
      
      // teacherNameAr (weight 2)
      if (r.teacherNameAr) {
        cand.set(r.teacherNameAr, (cand.get(r.teacherNameAr) || 0) + 2);
      }
      
      // Title pattern
      const tm = r.title.match(/(?:Mr|Mme|Mrs|Prof|Dr)\.?\s+([A-Z][a-zA-Z\u0600-\u06FF\s\-\.]{2,50})/);
      if (tm) {
        const tn = tm[1].trim();
        if (tn.split(' ').length >= 2) cand.set(tn, (cand.get(tn) || 0) + 2);
      }
      
      // fullText (first 3000 chars) - more patterns
      const fullText = r.content?.fullText;
      if (fullText) {
        const header = fullText.substring(0, 3000);
        // Common Tunisian/FR school doc patterns
        const patterns = [
          /(?:Teacher|teacher|Prof|prof)\s*[:.\s]+([A-Z][a-zA-Z\u0600-\u06FF\s\-\.]{3,50})/g,
          /(?:M(?:r|me|me|lle))\.?\s+([A-Z][a-zA-Z\u0600-\u06FF\s\-\.]{2,50})/g,
          /(?:Pr[eé]par[eé]?|Établi|Rédig[eé]?|Élabor[eé]?)\s+par\s+([A-Z][a-zA-Z\u0600-\u06FF\s\-\.]{2,50})/gi,
          /الأستاذ(?:ة)?\s*[:.\s]*([\u0600-\u06FF\s]{2,40})/g,
        ];
        for (const pat of patterns) {
          let m;
          while ((m = pat.exec(header)) !== null) {
            const name = m[1].trim().split(/\s{2,}|\n/)[0];
            if (name && name.length >= 3 && name.length < 50 && !name.match(/Mr|Mme|Prof|Teacher|Class|School/i)) {
              cand.set(name, (cand.get(name) || 0) + 1);
            }
          }
        }
      }
    }
  }
  
  // Find best candidate for each prof
  const fixes = [];
  for (const t of sameNames) {
    const cand = candidatesMap.get(t.id) || new Map();
    const sorted = [...cand.entries()]
      .filter(([name, count]) => name.split(/\s+/).length >= 2 && count >= 1)
      .sort((a, b) => b[1] - a[1]);
    
    for (const [name, count] of sorted) {
      const currentLower = (t.firstName + ' ' + t.lastName).toLowerCase().replace(/[^a-z\s]/g, '');
      const candLower = name.toLowerCase().replace(/[^a-z\s]/g, '');
      if (candLower === currentLower) continue;
      // If current has 1 word and cand includes it, skip
      const currentWords = currentLower.split(/\s+/).filter(Boolean);
      const candWords = candLower.split(/\s+/).filter(Boolean);
      if (currentWords.length === 1 && candWords.length > 1 && candWords.includes(currentWords[0]) && candWords[0] === currentWords[0]) continue;
      
      fixes.push({ id: t.numericId, fr: t.firstName + ' ' + t.lastName, newName: name, count, uploads: t._count.uploadedFiles });
      break;
    }
  }
  
  console.log('\nFixes to apply:', fixes.length);
  for (const f of fixes.slice(0, 50)) {
    console.log('  #' + f.id + ' | "' + f.fr + '" → "' + f.newName + '" (uploads: ' + f.uploads + ', count: ' + f.count + ')');
  }
  
  // Save to CSV
  const lines = ['numericId,fr,newName,uploads,count,profileUrl'];
  for (const f of fixes) {
    lines.push([f.id, JSON.stringify(f.fr), JSON.stringify(f.newName), f.uploads, f.count, 'https://examanet.com/fr/professeurs/' + f.id].join(','));
  }
  fs.writeFileSync('scripts/deep-candidates-2026-08-21.csv', lines.join('\n') + '\n');
  console.log('\nWrote scripts/deep-candidates-2026-08-21.csv');
  
  const noCand = sameNames.filter(t => !fixes.find(f => f.id === t.numericId));
  console.log('\nProfs WITHOUT any candidate:', noCand.length);
  for (const t of noCand.slice(0, 20)) {
    console.log('  #' + t.numericId + ' | "' + t.firstName + ' ' + t.lastName + '" | uploads: ' + t._count.uploadedFiles);
  }
}
main().then(() => p.$disconnect()).catch(e => { console.error('💥', e); p.$disconnect(); process.exit(1); });
