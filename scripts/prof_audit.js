require('dotenv').config({ path: '/workspace/edutunisie/.env.local' });
const { PrismaClient } = require('/workspace/edutunisie/node_modules/@prisma/client');
const p = new PrismaClient({ log: ['error'] });
(async () => {
  // Get all resources in physique lycée with prof info
  const files = await p.$queryRaw`
    SELECT r."numericId", r.title, r."teacherId", r."schoolType",
      rm."profNames", rm."schoolName"
    FROM "Resource" r
    JOIN "Class" c ON r."classId" = c.id
    JOIN "Level" l ON c."levelId" = l.id
    JOIN "Subject" s ON r."subjectId" = s.id
    LEFT JOIN "ResourceMetadata" rm ON rm."resourceId" = r.id
    WHERE l.slug = 'lycee' AND s.slug = 'physique' AND r.status = 'PUBLISHED'
  `;
  console.log(`Total files: ${files.length}`);
  
  // Get all profs who teach lycée physique via raw SQL
  const profs = await p.$queryRaw`
    SELECT u.id, u."numericId", u."firstName", u."lastName", u."firstNameAr", u."lastNameAr",
      u."schoolName", u."schoolNameAr",
      COUNT(DISTINCT r.id) FILTER (WHERE r.status = 'PUBLISHED') as resource_count
    FROM "User" u
    JOIN "Resource" r ON r."teacherId" = u.id
    JOIN "Class" c ON r."classId" = c.id
    JOIN "Level" l ON c."levelId" = l.id
    JOIN "Subject" s ON r."subjectId" = s.id
    WHERE u.role IN ('TEACHER', 'ADMIN')
      AND l.slug = 'lycee' AND s.slug = 'physique'
    GROUP BY u.id
  `;
  console.log(`\nTotal profs (DB) who teach lycée physique: ${profs.length}`);
  
  // Build prof lookup
  const profByName = new Map();
  const profByArName = new Map();
  for (const prof of profs) {
    const frKey = normalizeName(prof.firstName, prof.lastName);
    if (frKey) {
      if (!profByName.has(frKey)) profByName.set(frKey, []);
      profByName.get(frKey).push(prof);
    }
    const arKey = normalizeName(prof.firstNameAr, prof.lastNameAr);
    if (arKey) {
      if (!profByArName.has(arKey)) profByArName.set(arKey, []);
      profByArName.get(arKey).push(prof);
    }
  }
  console.log(`Unique FR prof names: ${profByName.size}`);
  console.log(`Unique AR prof names: ${profByArName.size}`);
  
  // Get all AI-extracted prof names
  const aiProfs = new Map();
  for (const f of files) {
    if (f.profNames && Array.isArray(f.profNames)) {
      for (const n of f.profNames) {
        const key = n.trim();
        if (key) aiProfs.set(key, (aiProfs.get(key) || 0) + 1);
      }
    }
  }
  const sorted = Array.from(aiProfs.entries()).sort((a, b) => b[1] - a[1]);
  console.log(`\nUnique AI-extracted prof names: ${sorted.length}`);
  console.log(`Top 20:`);
  for (const [name, count] of sorted.slice(0, 20)) {
    console.log(`  ${count}x ${name}`);
  }
  
  // Match: try to find each AI prof in DB
  console.log('\n=== AI profs NOT in DB (count≥2) ===');
  const notInDb = [];
  for (const [name, count] of sorted) {
    if (count < 2) continue;
    const key = normalizeSingleName(name);
    let found = false;
    for (const [dbKey, _] of profByName.entries()) {
      if (similarName(key, dbKey)) { found = true; break; }
    }
    if (!found) {
      for (const [dbKey, _] of profByArName.entries()) {
        if (similarName(key, dbKey)) { found = true; break; }
      }
    }
    if (!found) notInDb.push([name, count]);
  }
  for (const [name, count] of notInDb.slice(0, 50)) {
    console.log(`  ${count}x ${name}`);
  }
  console.log(`\nTotal AI profs (count≥2) not in DB: ${notInDb.length}`);
  
  // Now also check files where Resource.teacherId exists but AI profNames don't match
  console.log('\n=== Files where Resource.teacher != AI profNames ===');
  let mismatch = 0;
  for (const f of files) {
    if (!f.teacherId) continue;
    const teacher = profs.find(p => p.id === f.teacherId);
    if (!teacher) continue;
    const aiNames = (f.profNames || []).map(n => normalizeSingleName(n));
    const dbName = normalizeName(teacher.firstName, teacher.lastName);
    const dbArName = normalizeName(teacher.firstNameAr, teacher.lastNameAr);
    const match = aiNames.some(n => n === dbName || n === dbArName || similarName(n, dbName) || similarName(n, dbArName));
    if (!match) {
      mismatch++;
      if (mismatch <= 15) {
        console.log(`  #${f.numericId}: DB=[${dbName}] AI=${JSON.stringify(f.profNames)}`);
      }
    }
  }
  console.log(`\nTotal mismatches: ${mismatch} of ${files.filter(f => f.teacherId).length} with teacher`);
  
  await p.$disconnect();
})();

function normalizeName(first, last) {
  if (!first && !last) return null;
  return (first + ' ' + last).toLowerCase().trim().replace(/\s+/g, ' ');
}
function normalizeSingleName(s) {
  if (!s) return null;
  return s.toLowerCase().trim().replace(/\s+/g, ' ');
}
function similarName(a, b) {
  if (!a || !b) return false;
  if (a === b) return true;
  const aParts = a.split(' ');
  const bParts = b.split(' ');
  let matches = 0;
  for (const p of aParts) {
    if (p.length > 2 && bParts.includes(p)) matches++;
  }
  return matches >= 1 && (aParts.length <= 2 || bParts.length <= 2);
}
