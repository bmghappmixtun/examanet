// Backfill admin notifications for student signups that didn't get a notification

import { execSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

function genId() {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 25);
}

const CWD = '/workspace/edutunisie/.worktrees/cloudflare-poc';

function execD1(sql) {
  const tmpFile = path.join(os.tmpdir(), `d1-${Date.now()}-${Math.random().toString(36).slice(2)}.sql`);
  fs.writeFileSync(tmpFile, sql);
  try {
    const out = execSync(
      `npx wrangler d1 execute examanet-db --config wrangler.prod.jsonc --remote --command "${sql.replace(/"/g, '\\"').replace(/\n/g, ' ')}" --json 2>/dev/null`,
      { encoding: 'utf-8', cwd: CWD, maxBuffer: 50 * 1024 * 1024 }
    );
    return out;
  } finally {
    try { fs.unlinkSync(tmpFile); } catch {}
  }
}

function parseJson(out) {
  // Find the outermost JSON array
  const start = out.indexOf('[');
  if (start === -1) return null;
  let depth = 0;
  let end = -1;
  for (let i = start; i < out.length; i++) {
    if (out[i] === '[') depth++;
    else if (out[i] === ']') {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  if (end === -1) return null;
  try {
    return JSON.parse(out.slice(start, end + 1));
  } catch {
    return null;
  }
}

// Get admin
const adminOut = execD1("SELECT id FROM User WHERE role = 'ADMIN' LIMIT 1");
const adminData = parseJson(adminOut);
const adminId = adminData?.[0]?.results?.[0]?.id;
if (!adminId) {
  console.log('❌ No admin user found');
  process.exit(1);
}
console.log(`Admin: ${adminId}\n`);

// Get all students in batches
const allStudents = [];
const batchSize = 5;
let offset = 0;
while (true) {
  const out = execD1(`SELECT id, firstName, lastName, email, schoolName, governorate, classLevel FROM User WHERE role = 'STUDENT' ORDER BY createdAt DESC LIMIT ${batchSize} OFFSET ${offset}`);
  const data = parseJson(out);
  const students = data?.[0]?.results || [];
  if (students.length === 0) break;
  allStudents.push(...students);
  offset += batchSize;
  if (students.length < batchSize) break;
  await new Promise(r => setTimeout(r, 200));
}
console.log(`Total students: ${allStudents.length}`);

// Get all notifications
const notifsOut = execD1("SELECT body FROM Notification WHERE type = 'new_student_signed_up'");
const notifsData = parseJson(notifsOut);
const notifBodies = new Set((notifsData?.[0]?.results || []).map(n => n.body));
console.log(`Existing notifications: ${notifBodies.size}\n`);

let created = 0;
let skipped = 0;
const now = Date.now();
for (const s of allStudents) {
  const fullName = `${s.firstName || ''} ${s.lastName || ''}`.trim() || 'Un élève';
  const meta = [s.classLevel, s.schoolName, s.governorate].filter(Boolean).join(' · ') || '—';
  const body = `${fullName} (${s.email}) — ${meta}`;

  if (notifBodies.has(body)) {
    skipped++;
    continue;
  }

  // Create notification
  const id = genId();
  const sql = `INSERT INTO Notification (id, userId, type, title, body, link, isRead, createdAt) VALUES ('${id}', '${adminId}', 'new_student_signed_up', '🎓 Nouvel élève inscrit', '${body.replace(/'/g, "''")}', '/admin/utilisateurs?role=STUDENT', 0, ${now})`;
  try {
    execD1(sql);
    console.log(`  + ${s.email}`);
    created++;
  } catch (e) {
    console.log(`  ✗ ${s.email}: ${e.message}`);
  }
  await new Promise(r => setTimeout(r, 200));
}

console.log(`\n✓ Created: ${created}`);
console.log(`⏭ Skipped: ${skipped}`);
