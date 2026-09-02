#!/usr/bin/env node
/**
 * Apply teacher name fixes from user-provided CSV (2026-08-20)
 */
import { PrismaClient } from '@prisma/client';
import fs from 'fs';

const p = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL } }
});

async function main() {
  const csvPath = process.argv[2] || '/workspace/attachments/b4cf389e__0b1b1acb-6a3c-44ae-8230-19a9fe194f16.csv';
  const csv = fs.readFileSync(csvPath, 'utf8');
  const lines = csv.split('\n').filter(Boolean);
  const rows = lines.slice(1);
  
  let updated = 0, errors = 0;
  const errorLog = [];
  const examples = [];
  
  for (const line of rows) {
    const parts = line.split(',');
    const id = parseInt(parts[0]);
    const newFn = parts[1] || null;
    const newLn = parts[2] || null;
    const newFnAr = parts[3] || null;
    const newLnAr = parts[4] || null;
    
    if (!id || isNaN(id)) {
      errors++;
      continue;
    }
    
    try {
      const before = await p.user.findFirst({ where: { numericId: id }, select: { firstName: true, lastName: true, firstNameAr: true, lastNameAr: true, slug: true } });
      if (!before) {
        errors++;
        errorLog.push(`#${id} not found`);
        continue;
      }
      
      await p.user.updateMany({
        where: { numericId: id },
        data: {
          firstName: newFn || null,
          lastName: newLn || null,
          firstNameAr: newFnAr || null,
          lastNameAr: newLnAr || null,
        }
      });
      updated++;
      
      if (examples.length < 5) {
        examples.push({ id, before, after: { firstName: newFn, lastName: newLn, firstNameAr: newFnAr, lastNameAr: newLnAr } });
      }
    } catch (e) {
      errors++;
      errorLog.push(`#${id}: ${e.message.substring(0, 80)}`);
    }
  }
  
  console.log(`📊 Results:`);
  console.log(`   ✅ Updated: ${updated}`);
  console.log(`   ❌ Errors: ${errors}`);
  if (errorLog.length > 0) {
    console.log('\\nErrors (first 5):');
    for (const e of errorLog.slice(0, 5)) console.log('  ' + e);
  }
  console.log('\\n5 live links:');
  for (const ex of examples) {
    const url = 'https://examanet.com/fr/professeurs/' + ex.id;
    console.log(`  #${ex.id} | ${ex.after.firstName || ''} ${ex.after.lastName || ''} | ${url}`);
  }
}
main().then(() => p.$disconnect()).catch(e => { console.error('💥', e); p.$disconnect(); process.exit(1); });
