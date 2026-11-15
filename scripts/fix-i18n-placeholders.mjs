#!/usr/bin/env node
/**
 * 2026-11-15 — Échappe les placeholders ICU des messages next-intl utilisés
 * comme marqueurs HTML.
 *
 * Contexte : les pages `concours-9eme-tunisie`, `bac/archives` et `college`
 * utilisent `t('clé')` puis font un remplacement manuel
 * (`.replace(/\{strong\}/g, '<strong>')`, `.replace('{count}', n)` …).
 *
 * Problème : pour next-intl, `{strong}` est une VARIABLE ICU. Appelée sans
 * valeur, `t()` lève une FORMATTING_ERROR → next-intl la journalise en prod
 * (console.error) → le digest nocturne voit des « erreurs » à chaque rendu
 * de ces pages (plus de 240 événements en prod sur 24 h), alors que le
 * rendu est parfaitement correct.
 *
 * Correctif : on échappe les accolades au sens ICU (`'{'strong'}'`). Le
 * message formaté contient alors LITTÉRALEMENT `{strong}` (identique à
 * aujourd'hui) mais ICU ne voit plus de variable → plus aucune erreur, et
 * le `.replace()` du code continue de fonctionner à l'identique.
 *
 * Les variables « réelles » (count, total, year…) ne sont PAS échappées :
 * elles sont fournies au moment de l'appel.
 *
 * Usage : node scripts/fix-i18n-placeholders.mjs [--apply]
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const MSG_DIR = path.join(ROOT, 'src', 'messages');
const APPLY = process.argv.includes('--apply');

// Clés dont les placeholders sont utilisés comme marqueurs HTML (remplacer
// manuellement dans le code) et non comme variables ICU.
const HTML_MARKER_KEYS = [
  'bac.archives.heroTitle',
  'college.hero.subtitle',
  'concours.about.features.f2t',
  'concours.about.p1',
  'concours.about.p2',
  'concours.about.p3',
  'concours.calendar.subtitle',
  'concours.comparison.general.desc',
  'concours.comparison.subtitle',
  'concours.comparison.technique.desc',
  'concours.gold.corrigeLabel',
  'concours.gold.subtitle',
  'concours.hero.description',
  'concours.hero.titleMain',
  'concours.list.subtitle',
  'concours.list.yearFiles',
  'concours.meta.description',
  'concours.meta.title',
  'concours.methodology.subtitle',
  'concours.passes.actions.resultCount',
  'concours.passes.actions.totalCount',
  'concours.passes.cards.yearHeader',
  'concours.passes.statCorriges',
  'concours.passes.statGold',
  'concours.passes.statSujets',
  'concours.passes.title',
  'concours.pyramid.subtitle',
  'concours.pyramid.tipDesc',
];

/** Variables ICU réelles (fournies par le code) → jamais échappées. */
const REAL_VARIABLES = new Set([]);

function get(obj, dotted) {
  return dotted.split('.').reduce((acc, k) => (acc == null ? acc : acc[k]), obj);
}

function set(obj, dotted, value) {
  const parts = dotted.split('.');
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (typeof cur[parts[i]] !== 'object' || cur[parts[i]] === null) return false;
    cur = cur[parts[i]];
  }
  const last = parts[parts.length - 1];
  if (!(last in cur)) return false;
  cur[last] = value;
  return true;
}

/**
 * Échappe `{name}` en `'{'name'}'` (ICU : accolade littérale).
 * - Une apostrophe littérale placée juste avant une accolade est doublée
 *   (`''`) pour ne pas être consommée par le moteur ICU.
 * - Les variables réelles sont laissées intactes.
 */
function escapePlaceholders(message) {
  const before = message;
  // 1. apostrophes littérales suivies d'une accolade → doublées
  let out = message.replace(/(^|[^'])'(?=\{)/g, (m, p1) => `${p1}''`);
  // 2. blocs de balises HTML (<bold>…</bold>) : intl-messageformat les
  //    interprète comme des variables « tag ». On les quote ENTIÈREMENT
  //    (placeholder compris) pour sortir du parsing ICU.
  const blocks = [];
  out = out.replace(/<([A-Za-z0-9_]+)>[\s\S]*?<\/\1>/g, (block) => {
    blocks.push(block);
    return `\u0000B${blocks.length - 1}\u0000`;
  });
  // 3. placeholders → littéraux ICU
  out = out.replace(/\{([A-Za-z0-9_]+)\}/g, (full, name) => {
    if (REAL_VARIABLES.has(name)) return full;
    return `'{'${name}'}'`;
  });
  // 4. on restaure les blocs quotés
  out = out.replace(/\u0000B(\d+)\u0000/g, (m, i) => `'${blocks[Number(i)]}'`);
  return { out, changed: out !== before };
}

let totalChanged = 0;
const report = [];

for (const locale of ['fr', 'ar']) {
  const file = path.join(MSG_DIR, `${locale}.json`);
  const raw = fs.readFileSync(file, 'utf8');
  const json = JSON.parse(raw);
  let changedInFile = 0;

  for (const key of HTML_MARKER_KEYS) {
    const current = get(json, key);
    if (typeof current !== 'string') {
      report.push(`  [${locale}] ${key} → INTROUVABLE (ignoré)`);
      continue;
    }
    if (!/[{}]/.test(current)) {
      report.push(`  [${locale}] ${key} → aucun placeholder`);
      continue;
    }
    // idempotence : un message déjà échappé contient la séquence « '{'nom'}' »
    if (/'\{'[A-Za-z0-9_]+'\}'/.test(current)) {
      report.push(`  [${locale}] ${key} → déjà échappé (ignoré)`);
      continue;
    }
    const { out, changed } = escapePlaceholders(current);
    if (changed) {
      if (!set(json, key, out)) {
        report.push(`  [${locale}] ${key} → ÉCHEC set`);
        continue;
      }
      changedInFile++;
      report.push(`  [${locale}] ${key}`);
      report.push(`      avant : ${current}`);
      report.push(`      après : ${out}`);
    }
  }

  if (changedInFile > 0) {
    totalChanged += changedInFile;
    const next = JSON.stringify(json, null, 2); // même format que l'original (2 espaces, pas de newline final)
    if (APPLY) {
      fs.writeFileSync(file, next, 'utf8');
      console.log(`✅ ${locale}.json : ${changedInFile} message(s) échappé(s) (écrit)`);
    } else {
      console.log(`🔎 ${locale}.json : ${changedInFile} message(s) à échapper (dry-run)`);
    }
  } else {
    console.log(`➖ ${locale}.json : aucun changement`);
  }
}

console.log('\n' + report.join('\n'));
console.log(`\nTotal : ${totalChanged} message(s) — ${APPLY ? 'APPLIQUÉ' : 'DRY-RUN (relancer avec --apply)'}`);
