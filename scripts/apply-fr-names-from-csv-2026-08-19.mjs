#!/usr/bin/env node
/**
 * Apply FR names from user-provided CSV to the DB (2026-08-19)
 */
import { PrismaClient } from '@prisma/client';
import fs from 'fs';

const p = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL } }
});

async function main() {
  const csvPath = process.argv[2] || '/workspace/attachments/b1043a14__5afdab3e-6747-4ea8-a1ef-9d1a9b375193.csv';
  const csv = fs.readFileSync(csvPath, 'utf8');
  const lines = csv.split('\n').filter(Boolean);
  const header = lines[0].split(',');
  const idxId = header.indexOf('numericId');
  const idxFn = header.indexOf('firstName');
  const idxLn = header.indexOf('lastName');
  
  let updated = 0, skipped = 0, errors = 0;
  const examples = [];
  const errorLog = [];
  
  for (const line of lines.slice(1)) {
    const parts = line.split(',');
    const idStr = parts[idxId];
    const id = parseInt(idStr);
    const newFn = parts[idxFn] || '';
    const newLn = parts[idxLn] || '';
    
    if (!id || isNaN(id)) {
      skipped++;
      continue;
    }
    
    try {
      const before = await p.user.findFirst({ where: { numericId: id } });
      if (!before) {
        skipped++;
        errorLog.push(`#${id} not found`);
        continue;
      }
      
      await p.user.updateMany({
        where: { numericId: id },
        data: {
          firstName: newFn || null,
          lastName: newLn || null,
        }
      });
      updated++;
      
      if (examples.length < 5) {
        examples.push({ id, before, after: { firstName: newFn, lastName: newLn } });
      }
    } catch (e) {
      errors++;
      errorLog.push(`#${id}: ${e.message.substring(0, 80)}`);
    }
  }
  
  console.log(`📊 Results:`);
  console.log(`   ✅ Updated: ${updated}`);
  console.log(`   ⚠️ Skipped: ${skipped}`);
  console.log(`   ❌ Errors: ${errors}`);
  if (errorLog.length > 0) {
    console.log('\\nErrors (first 10):');
    for (const e of errorLog.slice(0, 10)) console.log('  ' + e);
  }
  console.log('\\n5 live links:');
  for (const ex of examples) {
    const url = 'https://examanet.com/fr/professeurs/' + ex.id;
    console.log(`  #${ex.id} | before: ${ex.before.firstName || ''} ${ex.before.lastName || ''} → after: ${ex.after.firstName} ${ex.after.lastName || ''} | ${url}`);
  }
}
main().then(() => p.$disconnect()).catch(e => { console.error('💥', e); p.$disconnect(); process.exit(1); });
