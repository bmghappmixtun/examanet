#!/usr/bin/env node
/**
 * Filter and apply AR names found in DB (2026-08-20)
 * 
 * Categories:
 * - VALID: real prof names (apply)
 * - GENERIC: "أستاذ X" or partial descriptions (skip)
 * - PARTIAL: only firstName or only lastName (skip — needs AI)
 * - LATIN: still in Latin script (skip)
 */
import { PrismaClient } from '@prisma/client';
import fs from 'fs';

const p = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL } }
});

const arabicRegex = /[\u0600-\u06FF]/;
const latinRegex = /[a-zA-Z]/;

// Generic patterns to filter out
const genericPatterns = [
  /^أستاذ\s/,
  /^الأسستاذ/,
  /^الأستاذ\s/,
  /^مؤدّسة$/,
  /^معلم/,
  /^استاذ/,
  /تكنولوجيا$/,
  /تكنولوجيا\s/,
  /التكنولوجيا$/,
  /التكنولوجيا\s/,
  /^مدرس/,
  /^الأستاذ$/,
  /^\s*$/,
];

function isGeneric(name) {
  if (!name) return true;
  for (const pat of genericPatterns) {
    if (pat.test(name)) return true;
  }
  return false;
}

function hasLatin(name) {
  return name && latinRegex.test(name);
}

function splitArName(name) {
  if (!name) return { firstNameAr: null, lastNameAr: null };
  
  // Try to split intelligently:
  // 1. "محمد بن عمارة" → firstName="محمد", lastName="بن عمارة"
  // 2. "ماهر السكوحي" → firstName="ماهر", lastName="السكوحي"
  // 3. "سالم العياري" → firstName="سالم", lastName="العياري"
  // 4. "زياد الماجري" → firstName="زياد", lastName="الماجري"
  
  const words = name.split(/\s+/).filter(Boolean);
  if (words.length === 0) return { firstNameAr: null, lastNameAr: null };
  if (words.length === 1) return { firstNameAr: words[0], lastNameAr: null };
  if (words.length === 2) return { firstNameAr: words[0], lastNameAr: words[1] };
  if (words.length === 3) {
    // If middle word is "بن" or "بنت" (bin/bint), it's a patronymic
    if (words[1] === 'بن' || words[1] === 'بنت' || words[1] === 'ابن' || words[1] === 'ابنة') {
      return { firstNameAr: words[0] + ' ' + words[1], lastNameAr: words[2] };
    }
    return { firstNameAr: words[0], lastNameAr: words.slice(1).join(' ') };
  }
  // 4+ words
  return { firstNameAr: words[0], lastNameAr: words.slice(1).join(' ') };
}

async function main() {
  const csv = fs.readFileSync('scripts/teachers-ar-found-in-db.csv', 'utf8');
  const lines = csv.split('\n').filter(Boolean);
  const header = lines[0].split(',');
  
  const valid = [];
  const generic = [];
  const partial = [];
  const latin = [];
  
  for (const line of lines.slice(1)) {
    const parts = line.split(',');
    const id = parseInt(parts[0]);
    const ar = (parts[3] || '').replace(/^"|"$/g, '');
    
    if (!ar || ar === '') {
      partial.push({ id, reason: 'empty' });
      continue;
    }
    if (hasLatin(ar)) {
      latin.push({ id, reason: 'has-latin', value: ar });
      continue;
    }
    if (isGeneric(ar)) {
      generic.push({ id, reason: 'generic', value: ar });
      continue;
    }
    
    const { firstNameAr, lastNameAr } = splitArName(ar);
    valid.push({ id, ar, firstNameAr, lastNameAr });
  }
  
  console.log('=== FILTER RESULTS ===');
  console.log('Valid (will apply):', valid.length);
  console.log('Generic (skipped): ', generic.length);
  console.log('Partial (skipped): ', partial.length);
  console.log('Latin (skipped):   ', latin.length);
  console.log('');
  
  console.log('Generic examples:');
  for (const g of generic.slice(0, 10)) console.log('  #' + g.id + ' | ' + g.value);
  console.log('\\nLatin examples:');
  for (const l of latin.slice(0, 5)) console.log('  #' + l.id + ' | ' + l.value);
  console.log('');
  
  // Apply valid ones
  let updated = 0;
  const examples = [];
  for (const v of valid) {
    try {
      const r = await p.user.updateMany({
        where: { numericId: v.id },
        data: {
          firstNameAr: v.firstNameAr,
          lastNameAr: v.lastNameAr,
        }
      });
      updated += r.count;
      if (examples.length < 5) examples.push(v);
    } catch (e) {
      console.log('  Error #' + v.id + ': ' + e.message.substring(0, 60));
    }
  }
  
  console.log('Applied:', updated, '/', valid.length);
  console.log('\\n5 examples:');
  for (const ex of examples) {
    console.log('  #' + ex.id + ' | AR: \"' + ex.firstNameAr + '\" \"' + ex.lastNameAr + '\" | ' + 'https://examanet.com/fr/professeurs/' + ex.id);
  }
}
main().then(() => p.$disconnect()).catch(e => { console.error('💥', e); p.$disconnect(); process.exit(1); });
