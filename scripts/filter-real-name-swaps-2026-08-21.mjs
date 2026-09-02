#!/usr/bin/env node
import { PrismaClient } from '@prisma/client';
import fs from 'fs';

const p = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL } }
});

async function main() {
  const csv = fs.readFileSync('scripts/pdf-different-names-2026-08-21.csv', 'utf8');
  const lines = csv.split('\n').filter(Boolean);
  
  const profs = await p.user.findMany({
    where: { role: 'TEACHER' },
    select: { numericId: true, firstName: true, lastName: true }
  });
  const profMap = new Map(profs.map(p => [p.numericId, p]));
  
  const realFixes = [];
  for (const line of lines.slice(1)) {
    const parts = line.split(',');
    if (parts.length < 5) continue;
    const id = parseInt(parts[0]);
    const newName = JSON.parse(parts[2] || '""');
    const count = parseInt(parts[4]);
    
    if (newName.match(/^Mr\.|^Mrs|^Mme\.|^M\.|^A\.|^T\.|^H\./i)) continue;
    if (newName.split(' ').length < 2) continue;
    if (newName.match(/أستاذ|الرياضيات|التكنولوجيا/)) continue;
    const words = newName.split(/\s+/);
    if (words[0] === words[1]) continue;
    
    const prof = profMap.get(id);
    if (!prof) continue;
    
    const currentLast = (prof.lastName || '').toLowerCase();
    const newLast = words[words.length - 1].toLowerCase();
    const newFirst = words[0].toLowerCase();
    const currentFirst = (prof.firstName || '').toLowerCase();
    
    // Names are swapped (PDF writes "LastName FirstName" but DB has "FirstName LastName")
    if (newLast === currentFirst && newFirst === currentLast) {
      realFixes.push({ id, current: prof.firstName + ' ' + prof.lastName, newName, count });
    }
  }
  
  console.log('Real fixes (name swap):', realFixes.length);
  for (const f of realFixes.slice(0, 50)) {
    console.log('  #' + f.id + ' | "' + f.current + '" → "' + f.newName + '" (count: ' + f.count + ')');
  }
  
  fs.writeFileSync('scripts/name-swap-fixes-2026-08-21.csv', 'numericId,current,newName,count\n' +
    realFixes.map(f => [f.id, JSON.stringify(f.current), JSON.stringify(f.newName), f.count].join(',')).join('\n') + '\n');
  console.log('\nWrote scripts/name-swap-fixes-2026-08-21.csv');
}
main().then(() => p.$disconnect()).catch(e => { console.error('💥', e); p.$disconnect(); process.exit(1); });
