#!/usr/bin/env node
/**
 * Extra-deep extraction: full keyInsights, exerciseInsights, full fullText (2026-08-21)
 * 
 * User feedback 2026-08-20: 'Continue avec des regex encore plus agressives
 * (chercher dans le contenu des exercices, dans les keyInsights)'
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
  console.log('Remaining same-name profs:', sameNames.length);
  
  const userIds = sameNames.map(t => t.id);
  
  // Get ALL resources with ALL metadata fields
  const resources = await p.resource.findMany({
    where: { teacherId: { in: userIds } },
    select: { 
      teacherId: true, title: true, description: true,
      teacherNameAr: true, schoolName: true,
      metadata: { 
        select: { 
          profNames: true, 
          exerciseInsights: true, 
          keyInsights: true,
          shortKeyPoints: true,
          keyPoints: true,
          generalSubject: true,
        } 
      },
      content: { select: { fullText: true } }
    }
  });
  
  console.log('Resources to scan:', resources.length);
  
  // Build candidates
  const candidatesMap = new Map();
  
  // Many more patterns
  const patterns = [
    // Common in FR docs
    /(?:M(?:r|me|me|lle)|Mr|Mme|Mrs|Prof|Dr|Teacher)\.?\s+([A-Z][a-zA-Z\u0600-\u06FF\s\-\.]{2,50})/g,
    // 'Établi par' / 'Préparé par' / etc
    /(?:Établi|Préparé|Rédigé|Rédigé par|Élaboré|Conçu|Composé|Découpé|Saisi|Tapé)\s+(?:par|et\s+saisi\s+par)?\s+([A-Z][a-zA-Z\u0600-\u06FF\s\-\.]{2,50})/gi,
    // 'Par M. X'
    /\bPar\s+(?:M\.|Mme\.|Mr\.|Mrs\.|Mlle\.)\s+([A-Z][a-zA-Z\u0600-\u06FF\s\-\.]{2,50})/g,
    // Author byline patterns
    /Auteur\s*[:\-]?\s+([A-Z][a-zA-Z\u0600-\u06FF\s\-\.]{2,50})/gi,
    // Tunisian/AR
    /الأستاذ(?:ة)?\s*[:.\-\s]*([\u0600-\u06FF\s]{2,40})/g,
    /معلم(?:ة)?\s*[:.\s]*([\u0600-\u06FF\s]{2,40})/g,
    /الأستاذ\s*الأول\s*[:.\s]*([\u0600-\u06FF\s]{2,40})/g,
    // Specific FR school patterns
    /Enseign(?:ant|e|é)\s*[:.\s]*([A-Z][a-zA-Z\u0600-\u06FF\s\-\.]{2,50})/g,
    /Le\s+prof(?:esseur)?\s*[:.\s]*([A-Z][a-zA-Z\u0600-\u06FF\s\-\.]{2,50})/g,
  ];
  
  let scanned = 0;
  for (const r of resources) {
    scanned++;
    if (scanned % 500 === 0) console.log('  Scanned ' + scanned + '/' + resources.length);
    
    if (!candidatesMap.has(r.teacherId)) candidatesMap.set(r.teacherId, new Map());
    const cand = candidatesMap.get(r.teacherId);
    
    const addCandidate = (name, weight, source) => {
      if (!name || name.length < 3 || name.length > 50) return;
      if (name.match(/^Mr|^Mrs|^Mme|^M\.|^Teacher|^Prof|^School|^Class|^Dr/i)) return;
      // Filter out generic
      if (name.match(/^أستاذ|^معلم|^الأستاذ|^الأسستاذ/)) return;
      // Filter out subjects
      if (name.match(/الرياضيات|الفلسفة|الفيزياء|التاريخ|الجغرافيا|عربية|فرنسية|إنجليزية/i)) return;
      cand.set(name, (cand.get(name) || 0) + weight);
    };
    
    // profNames (weight 4 - highest trust)
    if (r.metadata?.profNames) {
      for (const n of r.metadata.profNames) {
        if (n && n.length >= 3) addCandidate(n, 4, 'profNames');
      }
    }
    
    // teacherNameAr (weight 3)
    if (r.teacherNameAr) addCandidate(r.teacherNameAr, 3, 'teacherNameAr');
    
    // schoolName (no prof, just context)
    
    // exerciseInsights (weight 2)
    if (r.metadata?.exerciseInsights) {
      for (const insight of r.metadata.exerciseInsights) {
        if (insight && insight.length < 500) {
          for (const pat of patterns) {
            const re = new RegExp(pat.source, pat.flags);
            let m;
            while ((m = re.exec(insight)) !== null) {
              const name = m[1].trim().split(/\s{2,}|\n/)[0];
              addCandidate(name, 2, 'exerciseInsights');
            }
          }
        }
      }
    }
    
    // keyInsights (weight 2)
    if (r.metadata?.keyInsights) {
      for (const insight of r.metadata.keyInsights) {
        if (insight && insight.length < 500) {
          for (const pat of patterns) {
            const re = new RegExp(pat.source, pat.flags);
            let m;
            while ((m = re.exec(insight)) !== null) {
              const name = m[1].trim().split(/\s{2,}|\n/)[0];
              addCandidate(name, 2, 'keyInsights');
            }
          }
        }
      }
    }
    
    // Title pattern (weight 2)
    const tm = r.title.match(/(?:Mr|Mme|Mrs|Prof|Dr)\.?\s+([A-Z][a-zA-Z\u0600-\u06FF\s\-\.]{2,50})/);
    if (tm) {
      const tn = tm[1].trim();
      if (tn.split(' ').length >= 2) addCandidate(tn, 2, 'title');
    }
    
    // fullText (first 5000 chars - deeper scan) (weight 1)
    const fullText = r.content?.fullText;
    if (fullText) {
      const header = fullText.substring(0, 5000);
      for (const pat of patterns) {
        const re = new RegExp(pat.source, pat.flags);
        let m;
        while ((m = re.exec(header)) !== null) {
          const name = m[1].trim().split(/\s{2,}|\n/)[0];
          addCandidate(name, 1, 'fullText');
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
      const currentWords = currentLower.split(/\s+/).filter(Boolean);
      const candWords = candLower.split(/\s+/).filter(Boolean);
      if (currentWords.length === 1 && candWords.includes(currentWords[0]) && candWords[0] === currentWords[0]) continue;
      
      fixes.push({ id: t.numericId, fr: t.firstName + ' ' + t.lastName, newName: name, count, uploads: t._count.uploadedFiles });
      break;
    }
  }
  
  console.log('\nFixes found:', fixes.length);
  for (const f of fixes.slice(0, 50)) {
    console.log('  #' + f.id + ' | "' + f.fr + '" → "' + f.newName + '" (uploads: ' + f.uploads + ', count: ' + f.count + ')');
  }
  
  // Save
  const lines = ['numericId,fr,newName,uploads,count,profileUrl'];
  for (const f of fixes) {
    lines.push([f.id, JSON.stringify(f.fr), JSON.stringify(f.newName), f.uploads, f.count, 'https://examanet.com/fr/professeurs/' + f.id].join(','));
  }
  fs.writeFileSync('scripts/extra-deep-candidates-2026-08-21.csv', lines.join('\n') + '\n');
  console.log('\nWrote scripts/extra-deep-candidates-2026-08-21.csv');
  
  const noCand = sameNames.filter(t => !fixes.find(f => f.id === t.numericId));
  console.log('\nProfs WITHOUT any candidate:', noCand.length);
  for (const t of noCand.slice(0, 30)) {
    console.log('  #' + t.numericId + ' | "' + t.firstName + ' ' + t.lastName + '" | uploads: ' + t._count.uploadedFiles);
  }
}
main().then(() => p.$disconnect()).catch(e => { console.error('💥', e); p.$disconnect(); process.exit(1); });
