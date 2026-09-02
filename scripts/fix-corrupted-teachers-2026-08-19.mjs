#!/usr/bin/env node
/**
 * Fix corrupted teacher entries (2026-08-19)
 */
import { PrismaClient } from '@prisma/client';
import fs from 'fs';

const p = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL } }
});

async function fixPlaceholder(id) {
  const r = await p.user.updateMany({
    where: { numericId: id, lastName: '—' },
    data: { lastName: null },
  });
  return r.count;
}

async function fixAllCaps(id, firstName) {
  const fixed = firstName.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
  if (fixed === firstName) return 0;
  const r = await p.user.updateMany({
    where: { numericId: id, firstName },
    data: { firstName: fixed },
  });
  return r.count;
}

async function deleteTest(id) {
  try {
    await p.user.delete({ where: { numericId: id } });
    return 1;
  } catch (e) {
    return 0;
  }
}

async function main() {
  const csv = fs.readFileSync('scripts/teachers-missing-ar-corrupted.csv', 'utf8');
  const lines = csv.split('\n').filter(Boolean);
  const rows = lines.slice(1);
  
  let placeholderFixed = 0, allCapsFixed = 0, testDeleted = 0;
  const examples = [];
  
  for (const line of rows) {
    const m = line.match(/\"(.*?)\",\"(.*?)\",\"(.*?)\",(.*)/);
    if (!m) continue;
    const [, idStr, firstName, lastName, reasonsRaw] = m;
    const id = parseInt(idStr);
    // Strip leading/trailing quotes from reasons
    const reasons = reasonsRaw.replace(/^"|"$/g, '').split('|');
    
    if (reasons.includes('lastName=placeholder') && lastName === '—') {
      const n = await fixPlaceholder(id);
      if (n > 0) {
        placeholderFixed++;
        if (examples.length < 3) examples.push({ id, fix: 'placeholder→null', name: firstName });
      }
    }
    
    if (reasons.some(r => r.includes('firstName=ALL-CAPS')) && firstName === firstName.toUpperCase() && firstName.length > 2) {
      if (!reasons.some(r => r.includes('has-dot') || r.includes('too-short') || r.includes('multi-word'))) {
        const n = await fixAllCaps(id, firstName);
        if (n > 0) {
          allCapsFixed++;
          if (examples.length < 6) examples.push({ id, fix: 'ALL-CAPS→Title', name: firstName });
        }
      }
    }
    
    if (reasons.includes('test-name')) {
      const n = await deleteTest(id);
      if (n > 0) testDeleted++;
    }
  }
  
  console.log(`📊 Results:`);
  console.log(`   ✅ Placeholder (—) fixed: ${placeholderFixed}`);
  console.log(`   ✅ ALL-CAPS firstName fixed: ${allCapsFixed}`);
  console.log(`   🗑️  Test users deleted: ${testDeleted}`);
  console.log('');
  console.log(`5 live links:`);
  for (const ex of examples.slice(0, 5)) {
    const t = await p.user.findFirst({ where: { numericId: ex.id } });
    if (t) {
      console.log(`  #${t.numericId} | firstName: ${t.firstName} | lastName: ${t.lastName || '(null)'} → https://examanet.com/fr/professeurs/${t.numericId}/${t.slug || ''}`);
    }
  }
}
main().then(() => p.$disconnect()).catch(e => { console.error('💥', e); p.$disconnect(); process.exit(1); });
