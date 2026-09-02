#!/usr/bin/env node
/**
 * Apply AR names from CSV to DB (2026-08-19)
 */
import { PrismaClient } from '@prisma/client';
import fs from 'fs';

const p = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL } }
});

const BATCH = 100;
const csv = fs.readFileSync('/workspace/attachments/6d9423b1__0587e723-0305-4bca-b53a-c49fe1829e99.csv', 'utf8');
const lines = csv.split('\n').filter(Boolean);
const rows = lines.slice(1);

async function main() {
  let updated = 0, notFound = 0, errors = 0;
  const examples = [];
  // Process in batches
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    // Use transaction per batch
    await p.$transaction(async (tx) => {
      for (const line of batch) {
        const parts = line.split(',');
        const numericId = parseInt(parts[0]);
        const firstNameAr = parts[3] || null;
        const lastNameAr = parts[4] || null;
        if (!firstNameAr && !lastNameAr) continue;
        try {
          const r = await tx.user.updateMany({
            where: { numericId },
            data: { firstNameAr, lastNameAr },
          });
          if (r.count > 0) {
            updated++;
            if (examples.length < 5) {
              examples.push({ id: numericId, firstNameAr, lastNameAr, url: parts[5] });
            }
          } else {
            notFound++;
          }
        } catch (e) {
          errors++;
        }
      }
    });
    process.stdout.write(`\r  ${Math.min(i + BATCH, rows.length)}/${rows.length}...`);
  }
  console.log('');
  console.log(`📊 Results:`);
  console.log(`   ✅ Updated: ${updated}`);
  console.log(`   ❌ Not found: ${notFound}`);
  console.log(`   ⚠️  Errors: ${errors}`);
  console.log('');
  console.log(`Sample of 5 updated teachers (live links):`);
  for (const ex of examples) {
    console.log(`   #${ex.id}: ${ex.firstNameAr} ${ex.lastNameAr || ''} → ${ex.url}`);
  }
}
main().then(() => p.$disconnect()).catch(e => { console.error('💥', e); p.$disconnect(); process.exit(1); });
