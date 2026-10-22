#!/usr/bin/env node
/**
 * FIX-CLASS-SWAP-1ERE-3EME — corrige l'inversion 1ère ↔ 3ème secondaire.
 *
 * ⚠️  CONTRAINTE CRITIQUE : examanet-dev et examanet-prod partagent LE MÊME
 *     binding D1 (22ad2e7f-1692-486e-9131-d6c4062012e1). Il est donc IMPOSSIBLE
 *     de corriger les données « en dev seulement » : tout UPDATE est live en prod
 *     immédiatement. D'où le backup obligatoire + le dry-run par défaut.
 *
 * DIAGNOSTIC (2026-10-22) —抽样 sur les titres, qui contiennent le niveau :
 *   1ere-secondaire : 779 titres disent « 3ème »   + 1631 avec une section filière
 *   3eme-secondaire : 1008 titres disent « 1ère »
 *   2eme / 4eme     : corrects (360/600 « 2ème », 162/300 « 4ème »)
 *   → seul le couple 1ère ↔ 3ème est inversé. 2ème et 4ème sont intacts.
 *
 * PÉRIMÈTRE (conservateur, 2 niveaux de confiance) :
 *   NIVEAU_A — le titre annonce explicitement le niveau  → déplacement certain
 *   NIVEAU_B — pas de niveau dans le titre, MAIS une section filière
 *              (maths / sciences-experimentales / technique / eco-gestion /
 *               sciences-informatique / sport), sections qui n'existent que
 *              en 3ème/4ème secondaire → déplacement très probable
 *   NIVEAU_C — ni niveau dans le titre ni section → ON NE TOUCHE PAS (hasard)
 *
 * USAGE :
 *   node scripts/fix-class-swap-1ere-3eme.mjs --dry-run    (défaut, lecture seule)
 *   node scripts/fix-class-swap-1ere-3eme.mjs --backup     (crée la table backup)
 *   node scripts/fix-class-swap-1ere-3eme.mjs --apply      (applique, exige --backup)
 *   node scripts/fix-class-swap-1ere-3eme.mjs --restore    (annule depuis le backup)
 */

import { execFileSync } from 'node:child_process';

const DB = '22ad2e7f-1692-486e-9131-d6c4062012e1';
const ACCOUNT = '59cffdeaadf3809cc3d2039c43f836e8';
const BACKUP_TABLE = 'Resource_classId_backup_2026_10_22';

const ID_1ERE = 'cmqi8nqzx00082n4a36xys4pl';
const ID_3EME = 'cmqi8nr0r000k2n4abe7hvk7r';

// Filières qui, dans MEGA_MENU_DATA, n'existent qu'en 3ème / 4ème secondaire.
const FILIERES = [
  'maths',
  'sciences-experimentales',
  'technique',
  'eco-gestion',
  'sciences-informatique',
  'sport',
];

const args = new Set(process.argv.slice(2));
const dryRun = !args.has('--apply') && !args.has('--backup') && !args.has('--restore');

function d1(sql, remote = true) {
  // execFileSync (et non execSync) : le SQL contient des backticks qui
  // seraient mangés par /bin/sh si on passait par un shell.
  const argv = [
    'wrangler', 'd1', 'execute', DB,
    ...(remote ? ['--remote'] : ['--local']),
    `--command=${sql}`,
    '--json',
  ];
  const out = execFileSync('npx', argv, {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env },
  });
  const parsed = JSON.parse(out);
  // `wrangler d1 execute --json` renvoie un TABLEAU de result-sets : le flag
  // `success` est à l'intérieur du premier élément, pas au niveau racine.
  const set = Array.isArray(parsed) ? parsed[0] : parsed;
  if (!set || set.success !== true) {
    throw new Error(set?.errors?.map((e) => e.message).join('; ') || 'échec D1');
  }
  return set.results ?? [];
}

/** Compte seul — évite de ramener des milliers d'ids dans les logs. */
function d1Count(sql) {
  return d1(`SELECT COUNT(*) AS n FROM (${sql})`)[0]?.n ?? 0;
}

// ---------------------------------------------------------------------------
// Les deux ensembles de règles, symétriques.
// ---------------------------------------------------------------------------
const SAYS_1ERE = [
  "LOWER(r.title) LIKE '%1ere annee secondaire%'",
  "LOWER(r.title) LIKE '%1ère annee secondaire%'",
  "LOWER(r.title) LIKE '%1ere annee%'",
  "LOWER(r.title) LIKE '%1ère année%'",
  "LOWER(r.title) LIKE '%- 1as%'",
  "LOWER(r.title) LIKE '%1as -%'",
  "LOWER(r.title) LIKE '%1ere as %'",
  "LOWER(r.title) LIKE '%1ère as %'",
].join(' OR ');

const SAYS_3EME = [
  "LOWER(r.title) LIKE '%3eme annee secondaire%'",
  "LOWER(r.title) LIKE '%3ème année secondaire%'",
  "LOWER(r.title) LIKE '%3eme annee%'",
  "LOWER(r.title) LIKE '%3ème année%'",
  "LOWER(r.title) LIKE '%- 3as%'",
  "LOWER(r.title) LIKE '%3as -%'",
  "LOWER(r.title) LIKE '%3eme as %'",
  "LOWER(r.title) LIKE '%3ème as %'",
].join(' OR ');

const IN_A_FILIERE = `sec.slug IN (${FILIERES.map((s) => `'${s}'`).join(',')})`;

const BASE = `
  FROM Resource r
  LEFT JOIN \`Class\` cls ON r.classId = cls.id
  LEFT JOIN \`Section\` sec ON r.sectionId = sec.id
  WHERE r.status = 'PUBLISHED' AND r.isHidden = 0
`;

/** Ressources à déplacer de 1ère → 3ème */
const MOVE_1_TO_3 = `SELECT r.id AS id
  ${BASE}
  AND r.classId = '${ID_1ERE}'
  AND ( (${SAYS_3EME}) OR (${IN_A_FILIERE}) )
`;

/** Ressources à déplacer de 3ème → 1ère */
const MOVE_3_TO_1 = `SELECT r.id AS id
  ${BASE}
  AND r.classId = '${ID_3EME}'
  AND (${SAYS_1ERE})
`;

// ---------------------------------------------------------------------------

async function main() {
  console.log('══════════════════════════════════════════════════════════════');
  console.log(' FIX CLASS SWAP 1ère ↔ 3ème secondaire');
  console.log('══════════════════════════════════════════════════════════════\n');

  const n3 = d1Count(MOVE_1_TO_3);
  const n1 = d1Count(MOVE_3_TO_1);
  console.log(`  1ère → 3ème : ${n3} ressources`);
  console.log(`  3ème → 1ère : ${n1} ressources`);
  console.log(`  TOTAL        : ${n3 + n1}\n`);

  // Répartition par niveau de confiance
  const breakdown = d1(`
    SELECT
      CASE WHEN r.classId = '${ID_1ERE}' THEN '1ere->3eme' ELSE '3eme->1ere' END AS sens,
      CASE
        WHEN r.classId = '${ID_1ERE}' AND (${SAYS_3EME}) THEN 'A_titre_annonce_3eme'
        WHEN r.classId = '${ID_1ERE}' AND (${IN_A_FILIERE}) THEN 'B_section_filiere'
        ELSE 'A_titre_annonce_1ere'
      END AS confiance,
      COUNT(*) AS n
    ${BASE}
    AND (
      (r.classId = '${ID_1ERE}' AND ((${SAYS_3EME}) OR (${IN_A_FILIERE})))
      OR (r.classId = '${ID_3EME}' AND (${SAYS_1ERE}))
    )
    GROUP BY sens, confiance
  `);
  console.log('  Répartition par niveau de confiance :');
  for (const r of breakdown) {
    console.log(`    ${r.sens.padEnd(10)}  ${String(r.confiance).padEnd(26)} ${r.n}`);
  }

  if (dryRun) {
    console.log('\n  → DRY RUN. Aucune écriture. Relancer avec --backup puis --apply.\n');
    return;
  }

  if (args.has('--restore')) {
    const back = d1(`SELECT id, classId FROM ${BACKUP_TABLE} WHERE classId = '${ID_1ERE}'`);
    console.log(`\n  Restauration : ${back.length} ressources remises en 1ère…`);
    for (const r of back) d1(`UPDATE Resource SET classId='${ID_1ERE}' WHERE id='${r.id}'`);
    const back3 = d1(`SELECT id, classId FROM ${BACKUP_TABLE} WHERE classId = '${ID_3EME}'`);
    console.log(`  Restauration : ${back3.length} ressources remises en 3ème…`);
    for (const r of back3) d1(`UPDATE Resource SET classId='${ID_3EME}' WHERE id='${r.id}'`);
    console.log('  ✅ Restauré.\n');
    return;
  }

  if (args.has('--backup')) {
    const to3 = d1(MOVE_1_TO_3);
    const to1 = d1(MOVE_3_TO_1);
    d1(`CREATE TABLE IF NOT EXISTS ${BACKUP_TABLE} (
          id TEXT PRIMARY KEY,
          classId TEXT NOT NULL,
          savedAt TEXT NOT NULL DEFAULT (datetime('now'))
        )`);
    d1(`INSERT OR IGNORE INTO ${BACKUP_TABLE} (id, classId)
        SELECT r.id, r.classId FROM Resource r WHERE r.id IN (
          ${to3.map((r) => `'${r.id}'`).join(',') || "''"}
          ${to1.map((r) => `'${r.id}'`).join(',') || "''"}
        )`);
    const n = d1(`SELECT COUNT(*) AS n FROM ${BACKUP_TABLE}`);
    console.log(`\n  ✅ Backup créé : ${BACKUP_TABLE} (${n[0].n} lignes)\n`);
    console.log('  → Relancer avec --apply\n');
    return;
  }

  if (args.has('--apply')) {
    const hasBackup = d1(`SELECT name FROM sqlite_master WHERE type='table' AND name='${BACKUP_TABLE}'`);
    if (!hasBackup.length) throw new Error('Pas de backup. Lancer --backup avant --apply.');
    const to3 = d1(MOVE_1_TO_3);
    const to1 = d1(MOVE_3_TO_1);
    let ok = 0;
    for (const r of to3) { d1(`UPDATE Resource SET classId='${ID_3EME}' WHERE id='${r.id}'`); ok++; }
    for (const r of to1) { d1(`UPDATE Resource SET classId='${ID_1ERE}' WHERE id='${r.id}'`); ok++; }
    console.log(`\n  ✅ ${ok} ressources corrigées.\n`);
    return;
  }
}

main().catch((e) => {
  console.error('\n  ❌', e.message, '\n');
  process.exit(1);
});