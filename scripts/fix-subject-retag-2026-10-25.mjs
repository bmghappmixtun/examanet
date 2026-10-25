#!/usr/bin/env node
/**
 * Ré-étiquetage des matières mal classées (2026-10-25).
 *
 * Référentiel officiel tunisien (cf. topic `tunisia-official-curriculum-reference`) :
 *   - « Histoire-Géographie » est UNE matière combinée au COLLÈGE **et** en 1AS/2AS
 *     (tronc commun) → slug `histoire-geographie`
 *   - « Histoire » et « Géographie » séparément n'existent qu'en 3AS/4AS
 *   - `algo-prog` = « Algorithme et programmation » → 3AS/4AS **spécialité SI uniquement**
 *     (ni collège, ni 1AS, ni 2AS) → au collège/1AS/2AS la matière est `informatique`
 *
 * Constat avant correction (D1, 2026-10-25) :
 *   slug              7eme 8eme 9eme  1ere 2eme 3eme 4eme
 *   histoire           14   19   10     7    9     0     4   ← 59 à migrer
 *   geographie           9    8   12     2   10     1     2   ← 41 à migrer
 *   histoire-geographie  1    0    0     2    0     0     0   ← correct
 *   algo-prog            0    1    0     6    6    34    58   ← 13 à migrer
 *
 * Conséquence du bug : /fr/devoirs/histoire-geographie?cycle=college n'affichait
 * que 1 devoir au lieu de 25 (les 72 autres étaient invisibles car la page fait
 * `WHERE slug = ?` sur Subject, sans alias).
 *
 * Usage : node scripts/fix-subject-retag-2026-10-25.mjs [--dry-run]
 */

import { execFileSync } from 'node:child_process';

const DB = '22ad2e7f-1692-486e-9131-d6c4062012e1';
const ACCOUNT = '59cffdeaadf3809cc3d2039c43f836e0';
const dryRun = process.argv.includes('--dry-run');

/** Classes où la matière combinée « Histoire-Géographie » s'applique. */
const HG_CLASSES = ['7eme', '8eme', '9eme', '1ere-secondaire', '2eme-secondaire'];
/** Classes où la matière générique « Informatique » s'applique (algo-prog n'y a pas sa place). */
const INFORMAIQUE_CLASSES = ['7eme', '8eme', '9eme', '1ere-secondaire', '2eme-secondaire'];

const EXPECTED = { hg: 100, info: 13, total: 113 };

function d1(sql) {
  const out = execFileSync(
    'npx',
    ['wrangler', 'd1', 'execute', DB, '--remote', `--command=${sql}`, '--json'],
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, env: { ...process.env } }
  );
  const parsed = JSON.parse(out);
  const set = Array.isArray(parsed) ? parsed[0] : parsed;
  if (!set || set.success !== true) {
    throw new Error(set?.errors?.map((e) => e.message).join('; ') || 'échec D1');
  }
  return set;
}

const inList = (arr) => arr.map((s) => `'${s}'`).join(',');

const HG_SQL = `
  UPDATE Resource
  SET subjectId = (SELECT id FROM Subject WHERE slug = 'histoire-geographie')
  WHERE subjectId IN (SELECT id FROM Subject WHERE slug IN ('histoire','geographie'))
    AND classId IN (SELECT id FROM \`Class\` WHERE slug IN (${inList(HG_CLASSES)}))
`;

const INFO_SQL = `
  UPDATE Resource
  SET subjectId = (SELECT id FROM Subject WHERE slug = 'informatique')
  WHERE subjectId = (SELECT id FROM Subject WHERE slug = 'algo-prog')
    AND classId IN (SELECT id FROM \`Class\` WHERE slug IN (${inList(INFORMAIQUE_CLASSES)}))
`;

function countBefore() {
  const r = d1(`SELECT
      (SELECT COUNT(*) FROM Resource WHERE subjectId IN (SELECT id FROM Subject WHERE slug IN ('histoire','geographie'))
         AND classId IN (SELECT id FROM \`Class\` WHERE slug IN (${inList(HG_CLASSES)}))) AS hg,
      (SELECT COUNT(*) FROM Resource WHERE subjectId = (SELECT id FROM Subject WHERE slug = 'algo-prog')
         AND classId IN (SELECT id FROM \`Class\` WHERE slug IN (${inList(INFORMAIQUE_CLASSES)}))) AS info`);
  return r.results[0];
}

console.log('══════════════════════════════════════════════════════════════');
console.log(' Ré-étiquetage des matières (collège + 1AS/2AS)');
console.log('══════════════════════════════════════════════════════════════\n');

const before = countBefore();
console.log(`  AVANT  →  histoire-geographie : ${before.hg} à migrer`);
console.log(`  AVANT  →  informatique        : ${before.info} à migrer`);
console.log(`  TOTAL attendu : ${EXPECTED.total}\n`);

if (before.hg !== EXPECTED.hg || before.info !== EXPECTED.info) {
  console.error(
    `  ❌ ABORT : le nombre de lignes ne correspond pas à l'attendu ` +
      `(${before.hg}/${EXPECTED.hg} histoire-géo, ${before.info}/${EXPECTED.info} informatique). ` +
      `La base a changé depuis l'audit — ne rien appliquer.\n`
  );
  process.exit(1);
}

if (dryRun) {
  console.log('  → DRY RUN. Aucune écriture.\n');
  process.exit(0);
}

const r1 = d1(HG_SQL);
const r2 = d1(INFO_SQL);
console.log(`  ✅ ${r1.meta?.changes ?? 0} lignes → histoire-geographie`);
console.log(`  ✅ ${r2.meta?.changes ?? 0} lignes → informatique\n`);

const after = d1(`SELECT s.slug, c.slug AS classe, COUNT(*) AS n
  FROM Resource r JOIN Subject s ON r.subjectId = s.id JOIN \`Class\` c ON r.classId = c.id
  WHERE s.slug IN ('histoire','geographie','histoire-geographie','algo-prog','informatique')
    AND r.status='PUBLISHED' AND r.isHidden=0
  GROUP BY s.slug, c.slug ORDER BY s.slug, c.slug`);

console.log('  APRÈS (matières concernées) :');
for (const r of after.results) {
  console.log(`    ${r.slug.padEnd(22)} ${r.classe.padEnd(20)} ${String(r.n).padStart(4)}`);
}
console.log('');
