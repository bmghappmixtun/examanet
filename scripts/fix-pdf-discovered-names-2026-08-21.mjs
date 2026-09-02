#!/usr/bin/env node
/**
 * Fix profs based on PDF-discovered names (2026-08-21)
 * 
 * User feedback 2026-08-20: 'j'ai remarqué que qq fichiers contiennent
 * le vrai nom du prof (different de celui affiché) et que les autres
 * fichiers ont seulement le Nom du prof (pas de prénom dans l'entete),
 * donc pour ces derniers on garde just le nom (et on met à null le
 * prénom), et on essaie de re-extraire les vrai noms des profs qui
 * sont different de celui affiché'
 * 
 * Strategy:
 * 1. Find profs where ResourceMetadata.profNames gives a different name
 *    (e.g., "Chokri Mejri" for "Mejri Mejri")
 * 2. Update DB with the PDF-discovered name
 * 3. Find profs where PDF only has last name (no first name) - 
 *    set firstName/firstNameAr to null
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

// Detect if a candidate is different from current name
function isDifferent(candidate, current) {
  const candLower = candidate.toLowerCase().replace(/[^a-z\u0600-\u06FF\s]/g, '').trim();
  const currentLower = current.toLowerCase().replace(/[^a-z\u0600-\u06FF\s]/g, '').trim();
  if (candLower === currentLower) return false;
  // If candidate has more words than current, it's different
  const candWords = candLower.split(/\s+/).filter(Boolean);
  const currentWords = currentLower.split(/\s+/).filter(Boolean);
  if (candWords.length > currentWords.length) return true;
  // If first word differs, it's different
  if (candWords[0] !== currentWords[0]) return true;
  return false;
}

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
      metadata: { select: { profNames: true, exerciseInsights: true, keyInsights: true } },
      content: { select: { fullText: true } }
    }
  });
  
  // Group resources by prof
  const byProf = new Map();
  for (const r of resources) {
    if (!byProf.has(r.teacherId)) byProf.set(r.teacherId, []);
    byProf.get(r.teacherId).push(r);
  }
  
  // === PHASE 1: Find profs where PDF name is different from DB ===
  console.log('\n=== PHASE 1: Find profs with different PDF names ===');
  const differentName = [];
  for (const t of profs) {
    const profResources = byProf.get(t.id) || [];
    const candidates = new Map(); // candidate -> count
    
    for (const r of profResources) {
      // profNames (weight 4)
      if (r.metadata?.profNames) {
        for (const n of r.metadata.profNames) {
          if (n && n.length >= 3 && n.length < 50) {
            candidates.set(n, (candidates.get(n) || 0) + 4);
          }
        }
      }
      // teacherNameAr (weight 3)
      if (r.teacherNameAr) candidates.set(r.teacherNameAr, (candidates.get(r.teacherNameAr) || 0) + 3);
    }
    
    const currentFr = (t.firstName || '') + ' ' + (t.lastName || '');
    // Find best candidate that differs from current
    const sorted = [...candidates.entries()]
      .filter(([name, count]) => name.split(/\s+/).length >= 2 && count >= 3)
      .sort((a, b) => b[1] - a[1]);
    
    for (const [name, count] of sorted) {
      if (isDifferent(name, currentFr.trim())) {
        differentName.push({ id: t.numericId, currentFr, newName: name, count, uploads: t._count.uploadedFiles });
        break;
      }
    }
  }
  
  console.log('Profs with different PDF names:', differentName.length);
  for (const f of differentName.slice(0, 30)) {
    console.log('  #' + f.id + ' | "' + f.currentFr + '" → "' + f.newName + '" (uploads: ' + f.uploads + ', count: ' + f.count + ')');
  }
  
  // === PHASE 2: Find profs where PDF has ONLY last name ===
  console.log('\n=== PHASE 2: Find profs where PDF has only last name ===');
  const onlyLastName = [];
  for (const t of profs) {
    const profResources = byProf.get(t.id) || [];
    const candidates = new Map();
    
    for (const r of profResources) {
      if (r.metadata?.profNames) {
        for (const n of r.metadata.profNames) {
          if (n && n.length >= 3) {
            candidates.set(n, (candidates.get(n) || 0) + 4);
          }
        }
      }
      if (r.teacherNameAr) candidates.set(r.teacherNameAr, (candidates.get(r.teacherNameAr) || 0) + 3);
    }
    
    // Find candidate that matches ONLY the lastName (not firstName)
    const lastNameLower = (t.lastName || '').toLowerCase();
    const firstNameLower = (t.firstName || '').toLowerCase();
    
    for (const [name, count] of candidates) {
      const nameLower = name.toLowerCase();
      // If the candidate is just the lastName (or contains it as standalone)
      // but doesn't include the firstName, then PDF has only last name
      if (count >= 5 && nameLower.includes(lastNameLower) && !nameLower.includes(firstNameLower) && name.split(/\s+/).length <= 2) {
        // This means the PDF has the last name only
        if (lastNameLower && nameLower !== lastNameLower) {
          onlyLastName.push({ id: t.numericId, currentFr: (t.firstName||'') + ' ' + (t.lastName||''), pdfName: name, count, uploads: t._count.uploadedFiles });
          break;
        }
      }
    }
  }
  
  console.log('Profs where PDF has only last name:', onlyLastName.length);
  for (const f of onlyLastName.slice(0, 30)) {
    console.log('  #' + f.id + ' | "' + f.currentFr + '" PDF: "' + f.pdfName + '" (uploads: ' + f.uploads + ', count: ' + f.count + ')');
  }
  
  // === APPLY ===
  console.log('\n=== APPLYING FIXES ===');
  
  // Combine all fixes
  const allFixes = [
    ...differentName.map(f => ({ ...f, type: 'different' })),
    ...onlyLastName.map(f => ({ ...f, type: 'onlyLast' }))
  ];
  
  let applied = 0, failed = 0;
  for (let i = 0; i < allFixes.length; i++) {
    const f = allFixes[i];
    let newFn, newLn;
    
    if (f.type === 'different') {
      const parts = f.newName.split(/\s+/);
      newFn = parts[0];
      newLn = parts.slice(1).join(' ');
    } else {
      // onlyLast: keep last name only
      newFn = null;
      newLn = f.pdfName;
    }
    
    const ar = await callOpenAI(newFn, newLn);
    if (!ar) { failed++; continue; }
    
    try {
      await p.user.updateMany({
        where: { numericId: f.id },
        data: {
          firstName: newFn,
          lastName: newLn,
          firstNameAr: ar.firstNameAr || null,
          lastNameAr: ar.lastNameAr || null,
        }
      });
      applied++;
    } catch (e) {
      failed++;
    }
    
    if (i > 0 && i % 10 === 0) {
      console.log('  Progress: ' + i + '/' + allFixes.length + ' (' + applied + ' applied)');
      await new Promise(r => setTimeout(r, 300));
    }
  }
  console.log('Applied: ' + applied + ' / ' + allFixes.length + ', Failed: ' + failed);
  
  // Save
  fs.writeFileSync('scripts/pdf-discovered-fixes-2026-08-21.csv', 'numericId,type,current,newName,uploads,count\n' +
    allFixes.map(f => [f.id, f.type, JSON.stringify(f.currentFr), JSON.stringify(f.newName || f.pdfName), f.uploads, f.count].join(',')).join('\n') + '\n');
  console.log('Wrote scripts/pdf-discovered-fixes-2026-08-21.csv');
}
main().then(() => p.$disconnect()).catch(e => { console.error('💥', e); p.$disconnect(); process.exit(1); });
