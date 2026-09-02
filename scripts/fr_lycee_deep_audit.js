/**
 * FR Lycée Deep Audit (2026-08-10)
 *
 * Detects and flags:
 * 1. schoolType (PILOTE vs ordinaire/LYCEE) — via title + prof signals
 * 2. hasCorrection — via title pattern + file size heuristic
 * 3. section — via title pattern + DB section match
 * 4. Missing fields (schoolType=null, section=null when title implies one)
 */

require('dotenv').config({ path: '/workspace/edutunisie/.env.local' });
const { PrismaClient } = require('/workspace/edutunisie/node_modules/@prisma/client');
const p = new PrismaClient({ log: ['error'] });

// Section detection patterns in title (handles spaces, hyphens, ampersands)
// Section detection patterns in title (handles spaces, hyphens, ampersands)
// Strategy: detect unique keywords for each section
const SECTION_PATTERNS = {
  'Sciences Expérimentales': [/\bSciences?\s*[Ee]xp[éeè]rimentales?\b/, /\bSciences?\s+Exp\b/, /\bSc\s*Exp\b/, /\bSciences?\s*EXP\b/],
  // Économie-Gestion: any combo of "Économie" + "Gestion" (with or without "et"/hyphen/space)
  'Économie-Gestion': [/\b[ÉE]?con(?:omie)?[-/\s]+[ÉEe]?t?[-/\s]*[Gg]estion\b/, /\b[ÉE]conomie[-/\s]+[Gg]estion\b/, /\b[ÉE]co[-/\s]+[Gg]estion\b/, /\bEco-Gestion\b/],
  // Économie et services: combo of "Économie" + "Services" (with "et"/hyphen/space)
  'Économie et services': [/\b[ÉE]?con(?:omie)?[-/\s]+[ÉEe]?t[-/\s]+[Ss]ervices?\b/, /\b[ÉE]conomie[-/\s]+[Ss]ervices?\b/, /\bEco[-/\s]+Services?\b/, /\bEco\s*&\s*Services?\b/],
  'Mathématiques': [/\bMath[éeè]matiques?\b/, /\bMaths?\b(?![-]\w)/],
  'Lettres': [/\bLettres?\b/],
  'Technique': [/\bTechnique\b/],
  // Sciences de l'informatique: Sciences + Info(rmatique) (in that order)
  'Sciences de l\'informatique': [/\bSciences?\s+de\s+l['’]informatique\b/, /\bSciences?\s+Info(?:rmatique)?\b/, /\bSciences?\s+Info\b/, /\bSc\s*Info\b/],
  // Technologies de l'informatique: Tech + Info(rmatique), or just TI
  'Technologies de l\'informatique': [/\bTechnologies?\s+de\s+l['’]informatique\b/, /\bTech(?:nologies?)?\s+Info(?:rmatique)?\b/, /\b[-/\s]TI\b/],
  // Generic Sciences (only if NOT followed by "Exp" or "de l'info" or other)
  'Sciences': [/\bSciences?\b(?![-\s][ÉEe]xp|[-\s]de\s+l['’]in)/, /\bSc\b(?!\s*Exp)/],
};// Section slug mapping
const SECTION_SLUG = {
  'Sciences Expérimentales': 'sciences-experimentales',
  'Sciences': 'sciences',
  'Mathématiques': 'maths',
  'Lettres': 'lettres',
  'Technique': 'technique',
  'Économie et services': 'eco-services',
  'Économie-Gestion': 'eco-gestion',
  'Sciences de l\'informatique': 'sciences-informatique',
  'Technologies de l\'informatique': 'technologies-informatique',
};

// Detect section from title
function detectSectionFromTitle(title) {
  for (const [section, patterns] of Object.entries(SECTION_PATTERNS)) {
    for (const pat of patterns) {
      if (pat.test(title)) {
        return { section, slug: SECTION_SLUG[section] };
      }
    }
  }
  return null;
}

// Detect schoolType (PILOTE) from title
function detectSchoolTypeFromTitle(title) {
  if (/\bPilote\b/i.test(title)) return 'PILOTE';
  return 'LYCEE';
}

// Detect hasCorrection from title
function detectHasCorrectionFromTitle(title) {
  return /\bCorrig[ée]\b/i.test(title) || /DC\s/i.test(title);
}

async function main() {
  const files = await p.resource.findMany({
    where: { 
      status: 'PUBLISHED',
      subject: { slug: 'francais' },
      class: { level: { slug: 'lycee' } },
    },
    select: { 
      id: true, numericId: true, title: true,
      schoolType: true, hasCorrection: true, fileSize: true, pageCount: true,
      class: { select: { nameFr: true, slug: true } },
      section: { select: { id: true, nameFr: true, slug: true } },
    },
    orderBy: { numericId: 'asc' },
  });
  console.log(`\n=== DEEP AUDIT: ${files.length} FR lycée files ===\n`);
  
  // Build section lookup
  const allSections = await p.section.findMany();
  const sectionBySlug = new Map(allSections.map(s => [s.slug, s]));
  const sectionByName = new Map(allSections.map(s => [s.nameFr.toLowerCase(), s]));
  
  // Detect issues
  const issues = {
    schoolType_missing: [],
    schoolType_wrong: [],
    hasCorrection_wrong: [],
    section_missing: [],
    section_wrong: [],
  };
  
  // Stats
  const stats = {
    bySchoolType: {},
    bySection: {},
    byClass: {},
    avgFileSize: 0,
    corriges: 0,
  };
  
  let totalSize = 0;
  
  for (const f of files) {
    totalSize += f.fileSize || 0;
    
    const detectedST = detectSchoolTypeFromTitle(f.title);
    const detectedHC = detectHasCorrectionFromTitle(f.title);
    const detectedSec = detectSectionFromTitle(f.title);
    
    // SchoolType
    stats.bySchoolType[detectedST] = (stats.bySchoolType[detectedST] || 0) + 1;
    if (!f.schoolType) {
      issues.schoolType_missing.push({ id: f.id, numericId: f.numericId, title: f.title, detected: detectedST });
    } else if (f.schoolType !== detectedST) {
      issues.schoolType_wrong.push({ id: f.id, numericId: f.numericId, title: f.title, current: f.schoolType, detected: detectedST });
    }
    
    // hasCorrection
    if (detectedHC) stats.corriges++;
    if (f.hasCorrection !== detectedHC) {
      issues.hasCorrection_wrong.push({ id: f.id, numericId: f.numericId, title: f.title, current: f.hasCorrection, detected: detectedHC });
    }
    
    // Section
    let actualSection = null;
    if (detectedSec) {
      actualSection = sectionBySlug.get(detectedSec.slug) || sectionByName.get(detectedSec.section.toLowerCase());
    }
    
    if (detectedSec && !f.section) {
      issues.section_missing.push({ id: f.id, numericId: f.numericId, title: f.title, detected: detectedSec.section, slug: detectedSec.slug });
    } else if (detectedSec && f.section && f.section.slug !== detectedSec.slug) {
      issues.section_wrong.push({ id: f.id, numericId: f.numericId, title: f.title, current: f.section.nameFr, detected: detectedSec.section, currentSlug: f.section.slug, detectedSlug: detectedSec.slug });
    } else if (!detectedSec && f.section) {
      // Title has section in DB but no section in title — check if class is lycée 2-4ème (which should have section)
      const isLycee234 = ['2eme-secondaire', '3eme-secondaire', '4eme-secondaire'].includes(f.class?.slug);
      if (isLycee234) {
        issues.section_wrong.push({ id: f.id, numericId: f.numericId, title: f.title, current: f.section.nameFr, detected: '(none in title)' });
      }
    }
    
    // Stats
    const secKey = f.section?.nameFr || '(aucune)';
    stats.bySection[secKey] = (stats.bySection[secKey] || 0) + 1;
    const classKey = f.class?.nameFr || '?';
    stats.byClass[classKey] = (stats.byClass[classKey] || 0) + 1;
  }
  
  stats.avgFileSize = Math.round(totalSize / files.length / 1024);
  
  // Print
  console.log('📊 STATISTIQUES DÉTECTÉES (via titre):');
  console.log(`\n  SchoolType:`);
  for (const [k, v] of Object.entries(stats.bySchoolType)) {
    console.log(`    ${k}: ${v}`);
  }
  console.log(`\n  Corrigés détectés: ${stats.corriges}`);
  console.log(`  Avg file size: ${stats.avgFileSize} KB`);
  
  console.log(`\n⚠️  ISSUES TROUVÉES:\n`);
  for (const [type, items] of Object.entries(issues)) {
    if (items.length > 0) {
      console.log(`  ${type}: ${items.length}`);
      items.slice(0, 5).forEach(i => {
        if (type === 'schoolType_missing') {
          console.log(`    #${i.numericId}: ${i.title.substring(0, 80)} → should be ${i.detected}`);
        } else if (type === 'schoolType_wrong') {
          console.log(`    #${i.numericId}: ${i.title.substring(0, 80)} → has ${i.current}, should be ${i.detected}`);
        } else if (type === 'hasCorrection_wrong') {
          console.log(`    #${i.numericId}: ${i.title.substring(0, 80)} → has ${i.current}, should be ${i.detected}`);
        } else if (type === 'section_missing') {
          console.log(`    #${i.numericId}: ${i.title.substring(0, 80)} → should be section=${i.detected} (${i.slug})`);
        } else if (type === 'section_wrong') {
          console.log(`    #${i.numericId}: ${i.title.substring(0, 80)} → has ${i.current} (${i.currentSlug}), should be ${i.detected} (${i.detectedSlug})`);
        }
      });
      if (items.length > 5) console.log(`    ... and ${items.length - 5} more`);
    } else {
      console.log(`  ${type}: 0 ✓`);
    }
  }
  
  // Save issues to JSON
  const fs = require('fs');
  fs.writeFileSync('/tmp/fr_lycee_issues.json', JSON.stringify(issues, null, 2));
  console.log(`\n✓ Issues saved to /tmp/fr_lycee_issues.json`);
  
  await p.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
