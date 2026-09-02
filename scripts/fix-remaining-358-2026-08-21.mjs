#!/usr/bin/env node
/**
 * Fix remaining 358 same-name profs using comprehensive search (2026-08-21)
 * 
 * Sources searched:
 * - ResourceMetadata.profNames (AI extracted)
 * - Resource.teacherNameAr (PDF header)
 * - Resource.title (Mr/Mme/Prof patterns)
 * - Resource.schoolName
 * - ResourceMetadata.exerciseInsights (Teacher: Mr X patterns)
 * - ResourceMetadata.keyInsights
 * - ResourceContent.fullText (Mr/Mme/Prof/Teacher patterns in header)
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
  const profs = await p.user.findMany({
    where: { role: 'TEACHER' },
    select: { id: true, numericId: true, firstName: true, lastName: true, firstNameAr: true, lastNameAr: true, _count: { select: { uploadedFiles: true } } }
  });
  
  const sameNames = profs.filter(t => {
    const fr = t.firstName && t.lastName && t.firstName.toLowerCase() === t.lastName.toLowerCase();
    const ar = t.firstNameAr && t.lastNameAr && t.firstNameAr === t.lastNameAr;
    return fr || ar;
  });
  
  const userIds = sameNames.map(t => t.id);
  const resources = await p.resource.findMany({
    where: { teacherId: { in: userIds } },
    select: { 
      teacherId: true, title: true,
      teacherNameAr: true,
      metadata: { select: { profNames: true, exerciseInsights: true, keyInsights: true } },
      content: { select: { fullText: true } }
    }
  });
  
  const byProf = new Map();
  for (const r of resources) {
    if (!byProf.has(r.teacherId)) byProf.set(r.teacherId, []);
    byProf.get(r.teacherId).push(r);
  }
  
  const fixes = [];
  
  for (const t of sameNames) {
    const profResources = byProf.get(t.id) || [];
    const candidates = new Map(); // candidate -> count
    
    for (const r of profResources) {
      // profNames
      if (r.metadata?.profNames) {
        for (const n of r.metadata.profNames) {
          if (n && n.length >= 3 && n.length < 50 && !n.match(/أستاذ|Mr|Mrs|Mme/i) && n.split(' ').length >= 2) {
            candidates.set(n, (candidates.get(n) || 0) + 3);
          }
        }
      }
      // teacherNameAr
      if (r.teacherNameAr && r.teacherNameAr.length >= 3 && r.teacherNameAr.length < 50 && r.teacherNameAr.split(' ').length >= 2) {
        candidates.set(r.teacherNameAr, (candidates.get(r.teacherNameAr) || 0) + 2);
      }
      // title
      const titleMatch = r.title.match(/(?:Mr|Mme|Mrs|Prof|Dr)\s+([A-Z][a-zA-Z\u0600-\u06FF\s\-\.]{2,50})/);
      if (titleMatch) {
        const tn = titleMatch[1].trim();
        if (tn.split(' ').length >= 2) candidates.set(tn, (candidates.get(tn) || 0) + 2);
      }
      // fullText header
      const fullText = r.content?.fullText;
      if (fullText) {
        const header = fullText.substring(0, 1500);
        const patterns = [
          /(?:Teacher|teacher|Prof|prof)\s*[:.\s]+([A-Z][a-zA-Z\u0600-\u06FF\s\-\.]{3,50})/,
          /الأستاذ\s*[:.\s]*([\u0600-\u06FF\s]{2,30})/,
        ];
        for (const pat of patterns) {
          const m = header.match(pat);
          if (m) {
            const name = m[1].trim().split(/\s{2,}|\n/)[0];
            if (name.length >= 3 && name.length < 50) candidates.set(name, (candidates.get(name) || 0) + 1);
          }
        }
      }
    }
    
    // Find best candidate (highest count, with 2+ words)
    const sortedCandidates = [...candidates.entries()]
      .filter(([name, count]) => name.split(/\s+/).length >= 2)
      .sort((a, b) => b[1] - a[1]);
    
    if (sortedCandidates.length > 0) {
      const best = sortedCandidates[0][0];
      // Skip if best is too similar to current name
      const currentFr = (t.firstName + ' ' + t.lastName).toLowerCase().replace(/[^a-z\s]/g, '');
      const bestLower = best.toLowerCase().replace(/[^a-z\s]/g, '');
      if (bestLower.includes(currentFr.split(' ')[0]) && currentFr.split(' ').length > 1) {
        continue; // Same name, skip
      }
      fixes.push({ id: t.numericId, fr: t.firstName + ' ' + t.lastName, newName: best, uploads: t._count.uploadedFiles });
    }
  }
  
  console.log(`Total candidates found: ${fixes.length} / ${sameNames.length}`);
  console.log('\nFirst 30 fixes:');
  for (const f of fixes.slice(0, 30)) {
    console.log(`  #${f.id} | "${f.fr}" → "${f.newName}" (uploads: ${f.uploads})`);
  }
  
  // Apply fixes
  let applied = 0;
  for (let i = 0; i < fixes.length; i++) {
    const f = fixes[i];
    const parts = f.newName.split(/\s+/);
    const newFn = parts[0];
    const newLn = parts.slice(1).join(' ');
    
    // Get AR transliteration
    const ar = await callOpenAI(newFn, newLn);
    if (!ar) continue;
    
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
      console.log(`  Error #${f.id}: ${e.message.substring(0, 60)}`);
    }
    
    if (i > 0 && i % 5 === 0) await new Promise(r => setTimeout(r, 300));
  }
  console.log(`\nApplied: ${applied} / ${fixes.length}`);
}
main().then(() => p.$disconnect()).catch(e => { console.error('💥', e); p.$disconnect(); process.exit(1); });
