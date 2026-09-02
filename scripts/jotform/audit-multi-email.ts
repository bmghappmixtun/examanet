#!/usr/bin/env -S npx tsx
// Audit: Find teachers who have MULTIPLE emails in JotForm/Devoirat
// This catches duplicates before sending invitations.
//
// Usage:
//   tsx scripts/jotform/audit-multi-email.ts              # audit all DB teachers
//   tsx scripts/jotform/audit-multi-email.ts "Chaouki"   # audit one name
//   tsx scripts/jotform/audit-multi-email.ts --min-subs=2 # only teachers w/ 2+ subs
//
// Output: prints a report + saves JSON to /tmp/jotform-audit.json

import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';

const JOTFORM_API_KEY = process.env.JOTFORM_API_KEY!;
if (!JOTFORM_API_KEY) {
  console.error('❌ JOTFORM_API_KEY env var required');
  process.exit(1);
}

const BASE = 'https://eu-api.jotform.com';
const CACHE_FILE = '/tmp/jotform-subs-cache.json';

// All JotForm forms in the account
const FORMS = [
  { id: '10623304649', name: 'Tunisiecollege.net' },
  { id: '13465948895', name: 'Tunisiecollege.net Arabe' },
  { id: '2880314284',  name: 'Devoirat.net' },
  { id: '231496701948061', name: 'Quelle est votre fichier ?' },
  { id: '241023983108957', name: 'Primaireprivee.tn' },
];

const args = process.argv.slice(2);
const nameFilter = args.find(a => !a.startsWith('--'));
const minSubs = parseInt(args.find(a => a.startsWith('--min-subs='))?.split('=')[1] || '1');

interface Submission {
  formId: string;
  formName: string;
  id: string;
  date: string;
  name: string;
  email: string;
  status: string;
}

// 1. Load all submissions from all forms (with caching)
async function loadAllSubmissions(): Promise<Submission[]> {
  if (fs.existsSync(CACHE_FILE)) {
    const cached = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf-8'));
    if (cached.timestamp && Date.now() - cached.timestamp < 24 * 3600 * 1000) {
      console.log(`📦 Using cached submissions (${cached.subs.length} from ${new Date(cached.timestamp).toLocaleString()})`);
      return cached.subs;
    }
  }

  console.log('🌐 Downloading submissions from all JotForm forms...');
  const allSubs: Submission[] = [];
  for (const form of FORMS) {
    let offset = 0;
    const limit = 1000;
    while (true) {
      const url = `${BASE}/form/${form.id}/submissions?apiKey=${JOTFORM_API_KEY}&limit=${limit}&offset=${offset}`;
      const res = await fetch(url);
      const data: any = await res.json();
      const subs = data.content || [];
      for (const sub of subs) {
        const ans = sub.answers || {};
        let name = '-';
        let email = '-';
        for (const k of Object.keys(ans)) {
          const v = ans[k];
          const n = (v.name || '').toLowerCase();
          const a = String(v.answer || '');
          if (n.match(/name|nom|full/) && a) name = a;
          if (n.includes('email') && a) email = a;
        }
        allSubs.push({
          formId: form.id,
          formName: form.name,
          id: sub.id,
          date: sub.created_at?.slice(0, 10) || '?',
          name: name.trim(),
          email: email.trim().toLowerCase(),
          status: sub.status || '?',
        });
      }
      process.stdout.write(`\r  ${form.name}: ${allSubs.filter(s => s.formId === form.id).length} subs loaded...`);
      if (subs.length < limit) break;
      offset += limit;
    }
    console.log('');
  }

  fs.writeFileSync(CACHE_FILE, JSON.stringify({ timestamp: Date.now(), subs: allSubs }, null, 0));
  console.log(`✅ ${allSubs.length} submissions cached to ${CACHE_FILE}`);
  return allSubs;
}

// 2. Find subs matching a teacher (STRICT: email OR full name, not just last name)
function findSubsForTeacher(subs: Submission[], teacher: { email: string; firstName: string | null; lastName: string | null }) {
  const fullName = `${teacher.firstName || ''} ${teacher.lastName || ''}`.trim().toLowerCase();
  const lastName = (teacher.lastName || '').trim().toLowerCase();
  const firstName = (teacher.firstName || '').trim().toLowerCase();
  const email = teacher.email.trim().toLowerCase();

  return subs.filter(s => {
    // Match by exact email (strongest signal)
    if (s.email === email) return true;
    // Skip subs with broken names (the paymentArray bug)
    if (s.name.startsWith('{') || s.name === '-') return false;
    // Match by FULL name (firstName + lastName) in submission name
    const sName = s.name.toLowerCase();
    if (fullName && sName.includes(fullName)) return true;
    // Also match if firstName + lastName appear separately in any order
    if (firstName.length >= 3 && lastName.length >= 3 && sName.includes(firstName) && sName.includes(lastName)) return true;
    return false;
  });
}

async function main() {
  const subs = await loadAllSubmissions();
  const prisma = new PrismaClient();

  // Get teachers to audit
  let teachers: any[];
  if (nameFilter) {
    teachers = await prisma.user.findMany({
      where: {
        role: 'TEACHER',
        OR: [
          { firstName: { contains: nameFilter, mode: 'insensitive' } },
          { lastName:  { contains: nameFilter, mode: 'insensitive' } },
          { email:     { contains: nameFilter, mode: 'insensitive' } },
        ],
      },
      select: { id: true, email: true, firstName: true, lastName: true, status: true },
    });
    console.log(`\n🔍 Auditing ${teachers.length} teacher(s) matching "${nameFilter}"\n`);
  } else {
    // Exclude auto-imported teachers with no real email (they weren't from JotForm)
    teachers = await prisma.user.findMany({
      where: {
        role: 'TEACHER',
        NOT: { email: { contains: '@examanet-import.local' } },
      },
      select: { id: true, email: true, firstName: true, lastName: true, status: true },
    });
    console.log(`\n🔍 Auditing ${teachers.length} teachers (excluded @examanet-import.local auto-imports)\n`);
  }

  // For each teacher, find their subs
  const audit: any[] = [];
  let withMultipleEmails = 0;
  let withNoMatch = 0;
  let withMatch = 0;
  const emailToTeachers: Record<string, any[]> = {};

  for (const t of teachers) {
    const matches = findSubsForTeacher(subs, t);
    if (matches.length === 0) {
      withNoMatch++;
      continue;
    }
    const uniqueEmails = [...new Set(matches.map(m => m.email).filter(e => e !== '-' && e !== ''))];
    const dbEmail = t.email.toLowerCase();
    const allEmails = [...new Set([dbEmail, ...uniqueEmails])];

    if (allEmails.length > 1) {
      withMultipleEmails++;
    } else {
      withMatch++;
    }

    // Group subs by email
    const subsByEmail: Record<string, number> = {};
    for (const m of matches) {
      if (m.email && m.email !== '-') {
        subsByEmail[m.email] = (subsByEmail[m.email] || 0) + 1;
      }
    }

    audit.push({
      id: t.id,
      email: t.email,
      name: `${t.firstName || ''} ${t.lastName || ''}`.trim(),
      status: t.status,
      totalSubs: matches.length,
      uniqueEmails: allEmails,
      subsByEmail,
      hasMultipleEmails: allEmails.length > 1,
    });
  }

  // Filter by min-subs
  const filtered = audit.filter(a => a.totalSubs >= minSubs);
  filtered.sort((a, b) => b.totalSubs - a.totalSubs);

  // Print report
  console.log('═'.repeat(80));
  console.log('📊 AUDIT REPORT');
  console.log('═'.repeat(80));
  console.log(`Total teachers audited:    ${teachers.length}`);
  console.log(`With ≥1 JotForm match:     ${withMatch + withMultipleEmails}`);
  console.log(`  └─ Single email:         ${withMatch}`);
  console.log(`  └─ ⚠️ MULTIPLE EMAILS:   ${withMultipleEmails}`);
  console.log(`With NO JotForm match:     ${withNoMatch} (not from JotForm/Devoirat)`);
  console.log('');

  if (filtered.length === 0) {
    console.log('No teachers to show (try lowering --min-subs).');
  } else {
    // Show the multi-email ones first (most important)
    const multi = filtered.filter(a => a.hasMultipleEmails);
    if (multi.length > 0) {
      console.log('🚨 TEACHERS WITH MULTIPLE EMAILS:');
      console.log('─'.repeat(80));
      for (const a of multi) {
        console.log(`\n  ${a.name} (${a.email}) — status: ${a.status}`);
        console.log(`  ${a.totalSubs} submissions across ${a.uniqueEmails.length} emails:`);
        for (const [e, c] of Object.entries(a.subsByEmail).sort((a, b) => b[1] - a[1])) {
          const flag = e === a.email.toLowerCase() ? '✅ DB' : '⚠️ JOTFORM';
          console.log(`    ${flag}  ${c}x  ${e}`);
        }
      }
    }

    // Show top 10 single-email teachers
    const single = filtered.filter(a => !a.hasMultipleEmails).slice(0, 10);
    if (single.length > 0 && !nameFilter) {
      console.log('\n\n✅ TOP 10 SINGLE-EMAIL TEACHERS (by submission count):');
      console.log('─'.repeat(80));
      for (const a of single) {
        console.log(`  ${String(a.totalSubs).padStart(4)} subs  |  ${a.name.padEnd(40)}  |  ${a.email}`);
      }
    }
  }

  // Save JSON
  const outFile = '/tmp/jotform-audit.json';
  fs.writeFileSync(outFile, JSON.stringify({
    generatedAt: new Date().toISOString(),
    totalTeachers: teachers.length,
    withMultipleEmails,
    withNoMatch,
    teachers: audit,
  }, null, 2));
  console.log(`\n💾 Full report saved to ${outFile}`);

  await prisma.$disconnect();
}

main().catch(e => { console.error('💥', e); process.exit(1); });
