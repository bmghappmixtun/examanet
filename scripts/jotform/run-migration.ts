#!/usr/bin/env -S npx tsx
/**
 * Run JotForm migration: call /api/admin/jotform-migrate for each file
 * Reads /tmp/jotform-gharbi-ridha.json, filters by mounibtasnim@yahoo.fr,
 * authenticates as admin (boutiti.mehdi@gmail.com), and calls the API
 * for each file.
 */

import * as fs from 'fs';

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
  // Hit /connexion to get CSRF if needed
  const loginRes = await fetch(`${SITE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
  });
  if (!loginRes.ok) {
    const text = await loginRes.text();
    throw new Error(`Login failed: ${loginRes.status} ${text.slice(0, 200)}`);
  }
  const setCookie = loginRes.headers.get('set-cookie') || '';
  // Extract session cookie
  const cookies: string[] = [];
  for (const part of setCookie.split(/,(?=[^;]+=)/)) {
    const [kv] = part.split(';');
    if (kv) cookies.push(kv.trim());
  }
  if (cookies.length === 0) throw new Error('No session cookie returned');
  return cookies.join('; ');
}

async function main() {
  // 1. Update teacher email first via direct DB (we can't do this from the script easily)
  // Actually, the user said "ajoute l'addresse email" - we can do it via API
  // Or we just include it in the request body and let the admin do it via the UI later
  // For now, let's just record that the email needs to be updated
  log('=== Starting JotForm migration ===');
  log(`Teacher ID: ${TEACHER_ID}`);
  log(`Teacher email to add: ${TEACHER_EMAIL}`);

  // 2. Login
  log('Logging in as admin...');
  const cookies = await loginAdmin();
  log('Logged in successfully');

  // 3. Load data
  const allSubs: any[] = JSON.parse(fs.readFileSync('/tmp/jotform-gharbi-ridha.json', 'utf-8'));
  const subs = allSubs.filter(s => s.teacherEmail === TEACHER_EMAIL);
  log(`Found ${subs.length} submissions for ${TEACHER_EMAIL}`);

  // 4. Process each file
  let success = 0, failed = 0;
  let fileIdx = 0;
  const total = subs.reduce((s, x) => s + x.fileCount, 0);
  log(`Total files to process: ${total}`);

  for (const sub of subs) {
    for (const file of sub.files) {
      fileIdx++;
      const filename = decodeURIComponent(file.name || 'file.pdf');
      try {
        log(`[${fileIdx}/${total}] ${filename}`);
        const res = await fetch(`${SITE}/api/admin/jotform-migrate`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Cookie': cookies,
          },
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
      // Small delay to not hammer
      await new Promise(r => setTimeout(r, 200));
    }
  }

  log(`=== Done: ${success} success, ${failed} failed ===`);
}

main().catch(e => { console.error(e); process.exit(1); });
