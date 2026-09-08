// Insert admin notifications for the recent students
import { execSync } from 'child_process';

const STUDENTS = [
  { id: 'cmtove7x0001edb7upecyteq', name: 'Nour BenYounes', email: 'nourelhouda.by0405@gmail.com', numId: 2590, classLevel: null },
  { id: 'cmtojkpf0001edb7upecyteq', name: 'SF Emna', email: 'bsfamna@gmail.com', numId: 2589, classLevel: null },
  { id: 'cmtlucct0001edb7upecyteq', name: 'Rimes ghizaoui', email: 'bannourghizaoui@gmail.com', numId: 2588, classLevel: null },
  { id: 'cmtljiyj0001edb7upecyteq', name: 'Majd LEFI', email: 'majd.lefi@gmail.com', numId: 2587, classLevel: null },
  { id: 'cmtkmj0c0001edb7upecyteq', name: 'othman ritej', email: 'othmanritej420@gmail.com', numId: 2586, classLevel: null },
  { id: 'cmtklfqr0001edb7upecyteq', name: 'Farah Melki', email: 'farahmelki055@gmail.com', numId: 2584, classLevel: null },
  { id: 'cmthccvu0001edb7upecyteq', name: 'Kraiem Haroun', email: 'kraiemharoun459@gmail.com', numId: 2582, classLevel: null },
  { id: 'cmtgb89x0001edb7upecyteq', name: 'Ouni Youssef', email: 'youssefouni615@gmail.com', numId: 2581, classLevel: null },
  { id: 'cmtfn5lq0001edb7upecyteq', name: 'Loujayne Kacem', email: 'fatmazahrakacem6@gmail.com', numId: 2579, classLevel: null },
  { id: 'cmta5lik0001edb7upecyteq', name: 'Ikbel Ahmed', email: 'soumayaa999@gmail.com', numId: 2578, classLevel: null },
];

function genId() {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 25);
}

// Get admin user ID first
const adminRes = execSync(
  `npx wrangler d1 execute examanet-db --config wrangler.prod.jsonc --remote --command "SELECT id FROM User WHERE role = 'ADMIN' LIMIT 1" --json 2>/dev/null`,
  { encoding: 'utf-8', cwd: '/workspace/edutunisie/.worktrees/cloudflare-poc' }
);
const adminMatch = adminRes.match(/\[[\s\S]*?\]/);
const adminData = adminMatch ? JSON.parse(adminMatch[0]) : [];
const adminId = adminData[0]?.results?.[0]?.id;
if (!adminId) {
  console.log('Could not find admin user');
  process.exit(1);
}
console.log(`Admin ID: ${adminId}`);
console.log(`Backfilling ${STUDENTS.length} student notifications...`);

for (const s of STUDENTS) {
  const notifId = genId();
  const sql = `INSERT INTO Notification (id, userId, type, title, body, link, isRead, createdAt) VALUES ('${notifId}', '${adminId}', 'new_student_signed_up', '🎓 Nouvel élève inscrit (backfill)', '${s.name} (${s.email})', '/admin/utilisateurs?role=STUDENT', 0, ${Date.now()})`;
  try {
    const r = execSync(
      `npx wrangler d1 execute examanet-db --config wrangler.prod.jsonc --remote --command "${sql.replace(/"/g, '\\"').replace(/\n/g, ' ')}" 2>&1 | tail -3`,
      { encoding: 'utf-8', cwd: '/workspace/edutunisie/.worktrees/cloudflare-poc' }
    );
    if (r.includes('"success": true') || r.includes('executed successfully')) {
      console.log(`  ✓ ${s.name} (numId=${s.numId})`);
    } else if (r.includes('UNIQUE') || r.includes('constraint')) {
      console.log(`  ⚠ ${s.name} (already has notification)`);
    } else {
      console.log(`  ? ${s.name}: ${r.split('\n').filter(l => l.trim()).slice(-1)[0]}`);
    }
  } catch (e) {
    console.log(`  ✗ ${s.name}: ${e.message.split('\n')[0]}`);
  }
}
console.log('\nDone!');
