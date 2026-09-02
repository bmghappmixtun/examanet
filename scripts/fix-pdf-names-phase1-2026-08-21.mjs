#!/usr/bin/env node
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

function isDifferent(candidate, current) {
  const candLower = candidate.toLowerCase().replace(/[^a-z\u0600-\u06FF\s]/g, '').trim();
  const currentLower = current.toLowerCase().replace(/[^a-z\u0600-\u06FF\s]/g, '').trim();
  if (candLower === currentLower) return false;
  const candWords = candLower.split(/\s+/).filter(Boolean);
  const currentWords = currentLower.split(/\s+/).filter(Boolean);
  if (candWords.length > currentWords.length) return true;
  if (candWords[0] !== currentWords[0]) return true;
  return false;
}

async function main() {
  const profs = await p.user.findMany({
    where: { role: 'TEACHER' },
    select: { id: true, numericId: true, firstName: true, lastName: true, firstNameAr: true, lastNameAr: true, _count: { select: { uploadedFiles: true } } }
  });
  console.log('Total profs:', profs.length);
  
  // Process in batches
  const batchSize = 200;
  const differentName = [];
  
  for (let i = 0; i < profs.length; i += batchSize) {
    const batch = profs.slice(i, i + batchSize);
    const userIds = batch.map(t => t.id);
    
    const resources = await p.resource.findMany({
      where: { teacherId: { in: userIds } },
      select: { 
        teacherId: true,
        teacherNameAr: true,
        metadata: { select: { profNames: true } }
      }
    });
    
    // Group by prof
    const byProf = new Map();
    for (const r of resources) {
      if (!byProf.has(r.teacherId)) byProf.set(r.teacherId, []);
      byProf.get(r.teacherId).push(r);
    }
    
    for (const t of batch) {
      const profResources = byProf.get(t.id) || [];
      const candidates = new Map();
      
      for (const r of profResources) {
        if (r.metadata?.profNames) {
          for (const n of r.metadata.profNames) {
            if (n && n.length >= 3 && n.length < 50) {
              candidates.set(n, (candidates.get(n) || 0) + 4);
            }
          }
        }
        if (r.teacherNameAr) candidates.set(r.teacherNameAr, (candidates.get(r.teacherNameAr) || 0) + 3);
      }
      
      const currentFr = ((t.firstName || '') + ' ' + (t.lastName || '')).trim();
      const sorted = [...candidates.entries()]
        .filter(([name, count]) => name.split(/\s+/).length >= 2 && count >= 3)
        .sort((a, b) => b[1] - a[1]);
      
      for (const [name, count] of sorted) {
        if (isDifferent(name, currentFr)) {
          differentName.push({ id: t.numericId, currentFr, newName: name, count, uploads: t._count.uploadedFiles });
          break;
        }
      }
    }
    
    console.log(`  Processed batch ${i/batchSize + 1}/${Math.ceil(profs.length/batchSize)}, found ${differentName.length} so far`);
  }
  
  console.log('\n=== PHASE 1 RESULTS ===');
  console.log('Profs with different PDF names:', differentName.length);
  for (const f of differentName.slice(0, 50)) {
    console.log(`  #${f.id} | "${f.currentFr}" → "${f.newName}" (uploads: ${f.uploads}, count: ${f.count})`);
  }
  
  // Save
  fs.writeFileSync('scripts/pdf-different-names-2026-08-21.csv', 'numericId,current,newName,uploads,count\n' +
    differentName.map(f => [f.id, JSON.stringify(f.currentFr), JSON.stringify(f.newName), f.uploads, f.count].join(',')).join('\n') + '\n');
}
main().then(() => p.$disconnect()).catch(e => { console.error('💥', e); p.$disconnect(); process.exit(1); });
