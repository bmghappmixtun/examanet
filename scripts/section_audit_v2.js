require('dotenv').config({ path: '/workspace/edutunisie/.env.local' });
const { PrismaClient } = require('/workspace/edutunisie/node_modules/@prisma/client');
const p = new PrismaClient({ log: ['error'] });
(async () => {
  const files = await p.$queryRaw`
    SELECT r."numericId", r.title, r."sectionId",
      c.slug as class_slug, c."nameFr" as class_name,
      sec."nameFr" as section_name
    FROM "Resource" r
    JOIN "Class" c ON r."classId" = c.id
    JOIN "Level" l ON c."levelId" = l.id
    JOIN "Subject" s ON r."subjectId" = s.id
    LEFT JOIN "Section" sec ON r."sectionId" = sec.id
    WHERE l.slug = 'lycee' AND s.slug = 'physique' AND r.status = 'PUBLISHED'
  `;
  
  // Section patterns, MOST SPECIFIC FIRST (longest match wins)
  const SECTION_PATTERNS = [
    { name: 'Sciences Expérimentales', regex: /(Sciences?\s+Exp[ée]rimentales?|Sciences?\s+exp\b|Sc\.?\s*Exp\.?\b)/i, dbNames: ['Sciences Expérimentales'] },
    { name: 'Technologies de l\'informatique (TI)', regex: /(\(TI\)|Technologies?\s+de\s+l['']informatique|Tech(?:nolog(?:ie|iques?))?\s+de\s+l['']informatique)/i, dbNames: ['Technologies de l\'informatique (TI)'] },
    { name: 'Sciences de l\'informatique', regex: /(Sciences?\s+de\s+l['']informatique\b|Sciences?\s+informatiques?)/i, dbNames: ['Sciences de l\'informatique'] },
    { name: 'Économie et services', regex: /([ÉE]conomie\s+(?:et|&)\s+services?|Eco[\s-]+services?)/i, dbNames: ['Économie et services'] },
    { name: 'Économie-Gestion', regex: /([ÉE]conomie[\s-]*(?:&|et)\s*gestion|Eco[\s-]*gestion|[ÉE]conomie-gestion)/i, dbNames: ['Économie-Gestion'] },
    { name: 'Mathématiques', regex: /(\bBac\s+Math|\bBac\s+M|\b\d[èe]?me\s+Math|\b\d[èe]?me\s+M\b|Math[ée]matiques?)/i, dbNames: ['Mathématiques'] },
    { name: 'Lettres', regex: /\b(Lettres)\b/i, dbNames: ['Lettres'] },
    { name: 'Sport', regex: /\b(Sport)\b/i, dbNames: ['Sport'] },
    { name: 'Technique', regex: /(\bTechnique\b|\b3\s*tech\b|\b3tech\b|Tech\b)/i, dbNames: ['Technique'] },
    { name: 'Sciences', regex: /\b(Sciences?)\b/i, dbNames: ['Sciences'] },
  ];
  
  function detectSection(title) {
    for (const p of SECTION_PATTERNS) {
      if (p.regex.test(title)) return p;
    }
    return null;
  }
  
  let match = 0, mismatch = 0, noMatch = 0;
  const anomalies = [];
  
  for (const f of files) {
    if (f.class_slug === '1ere-secondaire') continue; // 1AS has no section
    
    const detected = detectSection(f.title);
    
    if (!detected) {
      noMatch++;
      continue;
    }
    
    if (!f.section_name) {
      anomalies.push({ ...f, detected: detected.name, issue: 'NULL_section' });
      continue;
    }
    
    // Does DB section match one of the detected's dbNames?
    if (detected.dbNames.includes(f.section_name)) {
      match++;
    } else {
      mismatch++;
      anomalies.push({ ...f, detected: detected.name, issue: 'section_mismatch' });
    }
  }
  
  console.log(`=== Section detection (longest-match first, excluding 1AS) ===`);
  console.log(`Match: ${match}`);
  console.log(`Mismatch: ${mismatch}`);
  console.log(`No match in title: ${noMatch}`);
  
  console.log(`\n=== Anomalies sample (max 50) ===`);
  for (const a of anomalies.slice(0, 50)) {
    console.log(`  #${a.numericId} [${a.issue}] DB=${a.section_name} Detected=${a.detected}`);
    console.log(`    ${a.title.substring(0, 100)}`);
  }
  
  // Group anomalies by detected vs db
  const groups = new Map();
  for (const a of anomalies) {
    const k = `${a.issue} | DB=${a.section_name || 'NULL'} → detected=${a.detected}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(a);
  }
  console.log(`\n=== Anomaly groups ===`);
  for (const [k, list] of Array.from(groups.entries()).sort((a, b) => b[1].length - a[1].length)) {
    console.log(`  ${list.length}x: ${k}`);
  }
  
  await p.$disconnect();
})();
