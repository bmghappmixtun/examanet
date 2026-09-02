require('dotenv').config({ path: '/workspace/edutunisie/.env.local' });
const { PrismaClient } = require('/workspace/edutunisie/node_modules/@prisma/client');
const p = new PrismaClient({ log: ['error'] });
(async () => {
  // Get all subjects for reference
  const subjects = await p.subject.findMany({ select: { id: true, slug: true, nameFr: true } });
  const byId = new Map(subjects.map(s => [s.id, s]));

  // Find files where the TITLE mentions a different subject than the DB
  const allFiles = await p.$queryRaw`
    SELECT r.id, r."numericId", r.title, r."subjectId", r."classId", r."schoolType",
      c."nameFr" as class_name, l.slug as level_slug,
      s.slug as subject_slug, s."nameFr" as subject_name
    FROM "Resource" r
    JOIN "Subject" s ON r."subjectId" = s.id
    JOIN "Class" c ON r."classId" = c.id
    JOIN "Level" l ON c."levelId" = l.id
    WHERE r.status = 'PUBLISHED'
  `;
  
  console.log(`Total files: ${allFiles.length}`);
  
  // Detect anomalies: title mentions a different subject than DB
  const anomalies = [];
  for (const f of allFiles) {
    const title = f.title.toLowerCase();
    const subject = f.subject_slug;
    
    // Subject keywords in title
    const keywords = {
      'mathematiques': /\bmath(ematiques|en)?\b|رياضي/i,
      'physique': /\bphysique\b|فيزياء/i,
      'svt': /\bsvt\b|علوم|طبيعة|حياة/i,
      'francais': /\bfran[çc]ais\b|french|عربية|فرنسية/i,
      'arabe': /\barabe\b|عربية/i,
      'histoire': /\bhistoire\b|تاريخ/i,
      'anglais': /\banglais\b|english/i,
      'informatique': /\binformatique\b|info\b/i,
    };
    
    // Check if title mentions a different subject
    for (const [subjSlug, regex] of Object.entries(keywords)) {
      if (subjSlug === subject) continue; // same subject, skip
      if (regex.test(title)) {
        anomalies.push({
          ...f,
          detectedSubject: subjSlug,
          match: title.match(regex)?.[0],
        });
        break;
      }
    }
    
    // Also check for class mismatch: title says "8ème" or "9ème" but class is lycée
    if (f.level_slug === 'lycee' && /\b(8|9)[\s-]?(ème|e)\b/i.test(title)) {
      anomalies.push({
        ...f,
        detectedSubject: f.subject_slug,
        issue: 'class_mismatch_lycee_vs_8eme_9eme',
      });
    }
    if (f.level_slug === 'lycee' && f.class_name?.includes('9ème')) {
      anomalies.push({
        ...f,
        detectedSubject: f.subject_slug,
        issue: 'class_9eme_in_lycee',
      });
    }
  }
  
  console.log(`\n=== ANOMALIES DETECTED: ${anomalies.length} ===\n`);
  
  // Group by type
  const byIssue = {};
  for (const a of anomalies) {
    const k = a.issue || `subject_mismatch_${a.detectedSubject}_vs_${a.subject_slug}`;
    if (!byIssue[k]) byIssue[k] = [];
    byIssue[k].push(a);
  }
  
  for (const [issue, list] of Object.entries(byIssue)) {
    console.log(`\n--- ${issue} (${list.length}) ---`);
    for (const a of list.slice(0, 10)) {
      console.log(`  #${a.numericId}: ${a.title.substring(0, 80)}`);
      console.log(`    DB: subject=${a.subject_slug} class=${a.class_name} (${a.level_slug})`);
      if (a.match) console.log(`    Detected in title: "${a.match}"`);
    }
    if (list.length > 10) console.log(`  ... and ${list.length - 10} more`);
  }
  
  await p.$disconnect();
})();
