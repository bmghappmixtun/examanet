/**
 * audit-resource-attributes.mjs
 *
 * Comprehensive audit: for each resource, parse the title and verify it matches
 * the DB attributes (type, class, section, subject, year, trimester).
 *
 * Strategy:
 * 1. For each PUBLISHED resource, parse the title to extract expected attributes
 * 2. Compare with the actual DB values
 * 3. Output a CSV-style report of mismatches
 * 4. Aggregate stats by type of mismatch
 *
 * Patterns recognized (FR + AR titles):
 * - Type: "Série d'exercices", "Devoir de Synthèse/Contrôle/Maison/Révision", "Cours", "Résumé", "TP/TD", "Examen", "Bac", "Contrôle", "فرض"/"درس"/"سلسلة"
 * - Class: "7ème/8ème/9ème" or "1ère/2ème/3ème/4ème" or "1AS/2AS/3AS/4AS" or "Lycée pilote" or "7/8/9 أساسي" or "الأولى/الثانية/الثالثة/الرابعة ثانوي"
 * - Section: "Sciences exp" or "Math" or "Lettres" or "Eco-Gestion" or "Technique" or "TI"
 * - Year: "(YYYY-YYYY)" at end
 * - Trimester: usually from N° in "Devoir de Synthèse N°2" (T2 if N=2)
 */

import { PrismaClient } from '@prisma/client';
import fs from 'fs';

const p = new PrismaClient();

// ============================================================================
// Title parsing — extract expected attributes from the title
// ============================================================================

function detectType(title) {
  if (!title) return null;
  const t = title.toLowerCase();

  // Arabic types
  if (/(?:^|\s)فرض\s*تأليفي/.test(t) || /(?:^|\s)فرض\s*تاليفي/.test(t) || /فرض.*تاليفي/.test(t) || /تأليف/.test(t)) return 'HOMEWORK';
  if (/(?:^|\s)فرض\s*مراقبة/.test(t) || /مراقبة/.test(t)) return 'HOMEWORK';
  if (/درس/.test(t) || /cours/.test(t) && /(?:^|\s)7\s*أساسي|(?:^|\s)8\s*أساسي|(?:^|\s)9\s*أساسي/.test(t)) return 'COURSE';
  if (/سلسلة\s*تمارين/.test(t) || /سلسلة\s*دروس/.test(t) || /تمارين\s*مراجعة/.test(t)) return 'EXERCISE';
  if (/ملخص/.test(t) || /résumé/.test(t)) return 'SUMMARY';
  if (/تطبيق|applications?/.test(t) && /7\s*أساسي|8\s*أساسي|9\s*أساسي/.test(t)) return 'COURSE';

  // French types
  if (/série\s*d.exercices|série\s*dexercices|^série\b/.test(t) || /serie\s*cor[rr]ig[ée]e/.test(t)) return 'EXERCISE';
  if (/devoir\s*de\s*synth[èe]se/.test(t)) return 'HOMEWORK';
  if (/devoir\s*de\s*contr[oô]le/.test(t)) return 'HOMEWORK';
  if (/devoir\s*de\s*maison/.test(t)) return 'HOMEWORK';
  if (/devoir\s*de\s*r[ée]vision/.test(t)) return 'HOMEWORK';
  if (/devoir\s*(?:corrig[ée]|de\s*r[ée]vision)\b/.test(t)) return 'HOMEWORK';
  if (/\btp\b|travaux\s*pratiques/.test(t)) return 'HOMEWORK';
  if (/\btd\b|travaux\s*dirig[ée]s/.test(t)) return 'EXERCISE';
  if (/\bcours\b/.test(t)) return 'COURSE';
  if (/r[ée]sum[ée]|fiche/.test(t)) return 'SUMMARY';
  if (/examen|contr[oô]le/.test(t)) return 'EXAM';
  if (/bac\b/.test(t) && /sujet|annales/.test(t)) return 'BAC_SUBJECT';
  if (/\bsujet\b/.test(t)) return 'EXAM';
  if (/concours/.test(t)) return 'BAC_SUBJECT';

  return null; // Unknown — don't flag
}

function detectClass(title) {
  if (!title) return null;
  const t = title.toLowerCase();

  // Arabic
  const arMatch = t.match(/(\d+)\s*أساسي/);
  if (arMatch) {
    const n = parseInt(arMatch[1]);
    if (n >= 7 && n <= 9) return `${n}eme`;
  }
  const arAsMatch = t.match(/الأولى\s*ثانوي|الثانية\s*ثانوي|الثالثة\s*ثانوي|الرابعة\s*ثانوي/);
  if (arAsMatch) {
    if (t.includes('الأولى')) return '1ere-secondaire';
    if (t.includes('الثانية')) return '2eme-secondaire';
    if (t.includes('الثالثة')) return '3eme-secondaire';
    if (t.includes('الرابعة')) return '4eme-secondaire';
  }
  if (/\b(1ère|1re|1er)\b.*année/.test(t) || /\b1\s*as\b/.test(t)) return '1ere-secondaire';
  if (/\b(2ème|2e)\b.*année/.test(t) || /\b2\s*as\b/.test(t)) return '2eme-secondaire';
  if (/\b(3ème|3e)\b.*année/.test(t) || /\b3\s*as\b/.test(t)) return '3eme-secondaire';
  if (/\b(4ème|4e)\b.*année/.test(t) || /\b4\s*as\b/.test(t)) return '4eme-secondaire';
  if (/\b7[èe]me\b/.test(t) || /\b7\s*ann[ée]e\b/.test(t)) return '7eme';
  if (/\b8[èe]me\b/.test(t) || /\b8\s*ann[ée]e\b/.test(t)) return '8eme';
  if (/\b9[èe]me\b/.test(t) || /\b9\s*ann[ée]e\b/.test(t)) return '9eme';

  return null;
}

function detectSection(title) {
  if (!title) return null;
  const t = title.toLowerCase();

  if (/sc\.?\s*exp|sc[ie]ence[s]?\s*exp[ée]rimentale|علوم\s*تجريبية/.test(t)) return 'sciences-experimentales';
  if (/sc\.?\s*inf|sc[ie]ence[s]?\s*info|علوم\s*الإعلامية|علوم\s*العلومات/.test(t)) return 'sciences-informatique';
  if (/math[ée]matiques?|math\b/.test(t) && !/math[ée]matiques?\s*exp/.test(t)) return 'maths';
  if (/lettres?|adab|آداب/.test(t)) return 'lettres';
  if (/[ée]co[ -]?gestion|[ée]conomie|eco\b|economia/.test(t) && !/services/.test(t)) return 'eco-gestion';
  if (/[ée]conomie.*services|eco-services|اقتصاد/.test(t)) return 'eco-services';
  if (/technique[s]?|tech\b/.test(t)) return 'technique';
  if (/ti\b|technologies?\s*informatique|إعلامية/.test(t)) return 'technologies-informatique';
  if (/sport\b|رياضة/.test(t)) return 'sport';

  return null;
}

function detectYear(title) {
  if (!title) return null;
  const m = title.match(/[(]?(\d{4})\s*[-–]\s*(\d{4})[)]?/);
  if (m) return `${m[1]}-${m[2]}`;
  // Single year
  const single = title.match(/[(]?(\d{4})[)]?\s*$/);
  if (single) return single[1];
  return null;
}

function detectTrimester(title) {
  if (!title) return null;
  // "N°1" or "N° 1" → T1, N°2 → T2, N°3 → T3
  const m = title.match(/n[°ºo]?\s*(\d+)/i);
  if (m) {
    const n = parseInt(m[1]);
    if (n >= 1 && n <= 3) return String(n);
    if (n >= 4 && n <= 12) {
      // Beyond 3 — might still be T1 if 1, T2 if 2-6, T3 if 7-12 (common for homework)
      if (n <= 6) return '2';
      return '3';
    }
  }
  return null;
}

function detectSubject(title) {
  if (!title) return null;
  const t = title.toLowerCase();

  // Order matters — more specific first
  if (/svt|sciences?\s*de\s*la\s*vie|علوم\s*الحياة/.test(t)) return 'svt';
  if (/sciences?\s*physiques|فيزياء/.test(t)) return 'physique';
  if (/physique\b/.test(t) && !/physique\s*-\s*chimie/.test(t)) return 'physique';
  if (/physique.*chimie|chimie.*physique/.test(t)) return 'physique';
  if (/math[ée]matiques?|math\b|رياضيات/.test(t) && !/math\s*exp/.test(t)) return 'mathematiques';
  if (/fran[çc]ais|فرنسية/.test(t)) return 'francais';
  if (/\barabe\b|عربية/.test(t)) return 'arabe';
  if (/anglais|إنجليزية/.test(t)) return 'anglais';
  if (/histoire|تاريخ/.test(t)) return 'histoire';
  if (/g[ée]ographie|جغرافيا/.test(t)) return 'geographie';
  if (/philosophie|فلسفة/.test(t)) return 'philosophie';
  if (/[ée]conomie|اقتصاد/.test(t)) return 'economie';
  if (/technologie|تكنولوجيا/.test(t)) return 'technologie';
  if (/informatique|algo|algo[ -]?prog|برمجة/.test(t)) return 'informatique';
  if (/musique|موسيقى/.test(t)) return 'musique';
  if (/th[éeE]âtre|مسرحي/.test(t)) return 'theatre';
  if (/arts?\s*plastiques?|رسم/.test(t)) return 'arts-plastiques';
  if (/[ée]ducation\s*islamique|اسلامية|إسلامية/.test(t)) return 'education-islamique';
  if (/[ée]ducation\s*civique|مدنية/.test(t)) return 'education-civique';

  return null;
}

// ============================================================================
// Main audit loop
// ============================================================================

console.log('=== Loading all published resources... ===');
const all = await p.resource.findMany({
  where: { status: 'PUBLISHED' },
  include: {
    subject: { select: { slug: true, nameFr: true } },
    class: { select: { slug: true, nameFr: true } },
    section: { select: { slug: true, nameFr: true } },
  },
  take: 50000, // adjust if needed
});
console.log(`Loaded ${all.length} resources`);

const mismatches = [];
const stats = {
  totalChecked: 0,
  noTypeInTitle: 0,
  noClassInTitle: 0,
  noSectionInTitle: 0,
  noYearInTitle: 0,
  noSubjectInTitle: 0,
  typeMismatch: 0,
  classMismatch: 0,
  sectionMismatch: 0,
  yearMismatch: 0,
  subjectMismatch: 0,
  trimesterMismatch: 0,
};

for (const r of all) {
  stats.totalChecked++;
  const title = r.title || '';
  const expType = detectType(title);
  const expClass = detectClass(title);
  const expSection = detectSection(title);
  const expYear = detectYear(title);
  const expSubject = detectSubject(title);
  const expTrimester = detectTrimester(title);

  // Type
  if (expType && r.type !== expType) {
    stats.typeMismatch++;
    mismatches.push({ id: r.id, type: 'type', expected: expType, actual: r.type, title });
  } else if (!expType) {
    stats.noTypeInTitle++;
  }

  // Class
  if (expClass && r.class && r.class.slug !== expClass) {
    stats.classMismatch++;
    mismatches.push({ id: r.id, type: 'class', expected: expClass, actual: r.class.slug, title });
  } else if (!expClass) {
    stats.noClassInTitle++;
  }

  // Section (only if title has one)
  if (expSection) {
    if (r.section && r.section.slug !== expSection) {
      stats.sectionMismatch++;
      mismatches.push({ id: r.id, type: 'section', expected: expSection, actual: r.section.slug, title });
    } else if (!r.section && (expSection === 'sciences-experimentales' || expSection === 'maths' || expSection === 'lettres' || expSection === 'eco-gestion' || expSection === 'technique' || expSection === 'sport')) {
      // For 3AS/4AS, expected sections are usually set
      stats.sectionMismatch++;
      mismatches.push({ id: r.id, type: 'section', expected: expSection, actual: null, title });
    }
  } else {
    stats.noSectionInTitle++;
  }

  // Year
  if (expYear && r.year && r.year !== expYear) {
    stats.yearMismatch++;
    mismatches.push({ id: r.id, type: 'year', expected: expYear, actual: r.year, title });
  } else if (!expYear) {
    stats.noYearInTitle++;
  }

  // Subject
  if (expSubject && r.subject && r.subject.slug !== expSubject) {
    stats.subjectMismatch++;
    mismatches.push({ id: r.id, type: 'subject', expected: expSubject, actual: r.subject.slug, title });
  } else if (!expSubject) {
    stats.noSubjectInTitle++;
  }

  // Trimester
  if (expTrimester && r.trimester && r.trimester !== expTrimester) {
    stats.trimesterMismatch++;
    mismatches.push({ id: r.id, type: 'trimester', expected: expTrimester, actual: r.trimester, title });
  }
}

// Save mismatches to CSV
const csv = 'id,type,expected,actual,title\n' + mismatches.map(m =>
  `${m.id},${m.type},${m.expected || ''},${m.actual || ''},"${(m.title || '').replace(/"/g, '""').replace(/\n/g, ' ')}"`
).join('\n');
fs.writeFileSync('scripts/one-off/audit-mismatches.csv', csv);
console.log(`\nWrote ${mismatches.length} mismatches to scripts/one-off/audit-mismatches.csv`);

// Print stats
console.log('\n=== Audit Statistics ===');
console.log(`Total checked: ${stats.totalChecked}`);
console.log(`\nDetection failures (couldn't extract from title):`);
console.log(`  noTypeInTitle:    ${stats.noTypeInTitle} (${(100*stats.noTypeInTitle/stats.totalChecked).toFixed(1)}%)`);
console.log(`  noClassInTitle:   ${stats.noClassInTitle} (${(100*stats.noClassInTitle/stats.totalChecked).toFixed(1)}%)`);
console.log(`  noSectionInTitle: ${stats.noSectionInTitle} (${(100*stats.noSectionInTitle/stats.totalChecked).toFixed(1)}%)`);
console.log(`  noYearInTitle:    ${stats.noYearInTitle} (${(100*stats.noYearInTitle/stats.totalChecked).toFixed(1)}%)`);
console.log(`  noSubjectInTitle: ${stats.noSubjectInTitle} (${(100*stats.noSubjectInTitle/stats.totalChecked).toFixed(1)}%)`);

console.log(`\nMismatches (extracted from title but doesn't match DB):`);
console.log(`  typeMismatch:      ${stats.typeMismatch}`);
console.log(`  classMismatch:     ${stats.classMismatch}`);
console.log(`  sectionMismatch:   ${stats.sectionMismatch}`);
console.log(`  yearMismatch:      ${stats.yearMismatch}`);
console.log(`  subjectMismatch:   ${stats.subjectMismatch}`);
console.log(`  trimesterMismatch: ${stats.trimesterMismatch}`);

// Show top mismatches by type
const byType = {};
for (const m of mismatches) {
  byType[m.type] = (byType[m.type] || 0) + 1;
}
console.log('\n=== Examples of mismatches ===');
for (const type of Object.keys(byType)) {
  const examples = mismatches.filter(m => m.type === type).slice(0, 3);
  console.log(`\n[${type}] ${byType[type]} total — examples:`);
  for (const e of examples) {
    console.log(`  - ${e.id}`);
    console.log(`    expected: ${e.expected}, actual: ${e.actual}`);
    console.log(`    title: ${e.title.substring(0, 80)}`);
  }
}

await p.$disconnect();
