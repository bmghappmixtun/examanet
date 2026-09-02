#!/usr/bin/env -S npx tsx
// Resume migration: skip already-imported submissions
import * as fs from 'fs';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const SITE = 'https://examanet.com';
const ADMIN_EMAIL = 'boutiti.mehdi@gmail.com';
const ADMIN_PASSWORD = 'demo1234';
const TEACHER_ID = 'cmqj8v8c90002hqfuq6knpy3k';
const TEACHER_EMAIL = 'mounibtasnim@yahoo.fr';
const LOG = '/tmp/jotform-migration.log';

function log(msg: string) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  fs.appendFileSync(LOG, line + '\n');
}

async function loginAdmin(): Promise<string> {
  const loginRes = await fetch(`${SITE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
  });
  if (!loginRes.ok) throw new Error(`Login failed: ${loginRes.status}`);
  const setCookie = loginRes.headers.get('set-cookie') || '';
  const cookies: string[] = [];
  for (const part of setCookie.split(/,(?=[^;]+=)/)) {
    const [kv] = part.split(';');
    if (kv) cookies.push(kv.trim());
  }
  return cookies.join('; ');
}

async function main() {
  log('=== Resume JotForm migration ===');
  const imported = await prisma.teacherFile.findMany({
    where: { teacherId: TEACHER_ID, notes: { contains: 'JotForm' } },
    select: { notes: true }
  });
  const importedIds = new Set(imported.map(i => {
    const m = i.notes?.match(/#(\d+)/);
    return m ? m[1] : null;
  }).filter(Boolean));
  log(`Already imported: ${importedIds.size} submissions`);

  const cookies = await loginAdmin();
  log('Logged in');

  const allSubs: any[] = JSON.parse(fs.readFileSync('/tmp/jotform-gharbi-ridha.json', 'utf-8'));
  const subs = allSubs.filter(s => s.teacherEmail === TEACHER_EMAIL && !importedIds.has(s.submissionId));
  log(`Remaining submissions: ${subs.length}`);

  let success = 0, failed = 0, skipped = 0;
  let fileIdx = 0;
  const total = subs.reduce((s, x) => s + x.fileCount, 0);

  for (const sub of subs) {
    for (const file of sub.files) {
      fileIdx++;
      const filename = decodeURIComponent(file.name || 'file.pdf');
      try {
        log(`[${fileIdx}/${total}] ${filename}`);
        const res = await fetch(`${SITE}/api/admin/jotform-migrate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Cookie': cookies },
          body: JSON.stringify({
            teacherId: TEACHER_ID,
            fileUrl: file.url,
            fileName: file.name,
            submissionId: sub.submissionId,
            formName: sub.formName,
            createdAt: sub.createdAt,
          }),
        });
        const result = await res.json();
        if (res.ok && result.success) {
          log(`  OK: TeacherFile=${result.teacherFileId} Resource=${result.resourceId}`);
          success++;
        } else {
          log(`  FAIL: ${result.error || res.status}`);
          failed++;
        }
      } catch (e: any) {
        log(`  ERROR: ${e.message}`);
        failed++;
      }
      await new Promise(r => setTimeout(r, 300));
    }
  }

  log(`=== Done: ${success} success, ${failed} failed ===`);
  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
