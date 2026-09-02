require('dotenv').config({ path: '/workspace/edutunisie/.env.local' });
const { PrismaClient } = require('/workspace/edutunisie/node_modules/@prisma/client');
const p = new PrismaClient({ log: ['error'] });
(async () => {
  // Get all files with section info
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
  console.log(`Total files: ${files.length}`);
  
  // Section patterns in title
  const SECTION_PATTERNS = [
    { name: 'Sciences Expérimentales', regex: /(Sciences?\s+Exp[ée]rimentales?|Sc\s*Exp|Sciences?\s+exp)/i },
    { name: 'Sciences', regex: /(?:^|[\s-])(Sciences?)(?:[\s-]|$)/i },
    { name: 'Mathématiques', regex: /(?:\bBac\s+|\b\d[èe]?me\s+|\b\d[èe]?re\s+)(Math[ée]matiques?|Math)\b/i },
    { name: 'Technique', regex: /(Technique|3\s*tech|techno)/i },
    { name: 'Sciences de l\'informatique', regex: /(Sciences?\s+de\s+l.informatique|TI|Informatique)/i },
    { name: 'Économie & gestion', regex: /([ÉE]conomie|eco\s*gestion)/i },
    { name: 'Économie & services', regex: /([ÉE]conomie\s*&\s*services|eco\s*services)/i },
    { name: 'Lettres', regex: /(\bLettres\b)/i },
    { name: 'Sport', regex: /(\bSport\b)/i },
  ];
  
  // For each file, detect section from title
  const anomalies = [];
  const matchCount = new Map();
  let nullSectionButHasInTitle = 0;
  let sectionMatchesTitle = 0;
  let sectionMismatchesTitle = 0;
  let noMatchEitherWay = 0;
  
  for (const f of files) {
    // Skip 1AS (no section expected)
    if (f.class_slug === '1ere-secondaire') continue;
    
    const titleSections = new Set();
    for (const p of SECTION_PATTERNS) {
      if (p.regex.test(f.title)) titleSections.add(p.name);
    }
    
    if (titleSections.size === 0) {
      noMatchEitherWay++;
      continue;
    }
    
    if (!f.section_name) {
      nullSectionButHasInTitle++;
      if (nullSectionButHasInTitle <= 20) {
        anomalies.push({ ...f, titleSections: Array.from(titleSections), issue: 'NULL_section_but_title_has_section' });
      }
      continue;
    }
    
    // Check if section in DB matches any in title
    const dbSection = f.section_name;
    if (titleSections.has(dbSection)) {
      sectionMatchesTitle++;
      for (const s of titleSections) matchCount.set(s, (matchCount.get(s) || 0) + 1);
    } else {
      sectionMismatchesTitle++;
      if (anomalies.length < 30) {
        anomalies.push({ ...f, titleSections: Array.from(titleSections), issue: 'section_mismatch' });
      }
    }
  }
  
  console.log(`\n=== Section detection (excluding 1AS) ===`);
  console.log(`No section in title or DB: ${noMatchEitherWay}`);
  console.log(`Section in title but NULL in DB: ${nullSectionButHasInTitle}`);
  console.log(`Section in DB matches title: ${sectionMatchesTitle}`);
  console.log(`Section in DB MISMATCHES title: ${sectionMismatchesTitle}`);
  
  console.log(`\n=== Match distribution by section ===`);
  for (const [s, c] of Array.from(matchCount.entries()).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${c}x ${s}`);
  }
  
  console.log(`\n=== First 30 anomalies ===`);
  for (const a of anomalies) {
    console.log(`  #${a.numericId} [${a.issue}] DB=${a.section_name || 'NULL'} Title=${a.titleSections.join(',')}`);
    console.log(`    ${a.title.substring(0, 100)}`);
  }
  
  await p.$disconnect();
})();
