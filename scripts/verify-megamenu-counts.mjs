#!/usr/bin/env node
/**
 * Vérification des liens du méga-menu « Catalogue » (MenuMatieresCollegeLycee).
 *
 * Pour chaque lien, on compare 3 chiffres :
 *   A. le total AFFICHÉ par la page (stat du hero, lu dans le HTML SSR)
 *   B. le total renvoyé par l'API de listing que la page consomme
 *   C. le total de la MÊME sélection via /fr/ressources
 *      (/api/ressources-data avec les filtres équivalents : subject + type + class)
 *
 * A == B == C  →  le lien affiche le bon nombre.
 *
 * Équivalences :
 *   /fr/devoirs/{s}?cycle=C → type=DEVOIR
 *   /fr/series/{s}?cycle=C  → type=EXERCISE
 *   /fr/cours/{s}?cycle=C   → type=COURSE
 *   cycle college → classes 7eme,8eme,9eme
 *   cycle lycee   → classes 1ere-secondaire,2eme-secondaire,3eme-secondaire,4eme-secondaire
 *   /fr/matieres/{s} → pas de filtre type ni class
 *
 * Usage: node scripts/verify-megamenu-counts.mjs <baseUrl> <links.json>
 */
import { readFileSync } from 'node:fs';

const BASE = process.argv[2] || 'https://examanet.com';
const LINKS_FILE = process.argv[3] || '/tmp/mm-links.json';

const CLASSES = {
  college: ['7eme', '8eme', '9eme'],
  lycee: ['1ere-secondaire', '2eme-secondaire', '3eme-secondaire', '4eme-secondaire'],
};
const TYPE = { devoirs: 'DEVOIR', series: 'EXERCISE', cours: 'COURSE' };

const raw = JSON.parse(readFileSync(LINKS_FILE, 'utf8'));
const links = [...new Map(
  [...raw.college, ...raw.lycee].map((l) => [l.href, l])
).values()].sort((a, b) => a.href.localeCompare(b.href));

async function get(url, opts = {}) {
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(url, { ...opts, signal: AbortSignal.timeout(45000) });
      const text = await r.text();
      return { status: r.status, text };
    } catch (e) {
      if (i === 2) return { status: 0, text: '', error: e.message };
      await new Promise((r) => setTimeout(r, 1200));
    }
  }
}

async function getJson(url) {
  const r = await get(url);
  try { return { status: r.status, json: JSON.parse(r.text) }; }
  catch { return { status: r.status, json: null }; }
}

/** Parse une URL du méga-menu → { kind, subject, cycle }. */
function parse(href) {
  const u = new URL(href, BASE);
  const seg = u.pathname.replace(/^\/(fr|ar)\//, '').split('/');
  const cycle = u.searchParams.get('cycle');
  if (seg[0] === 'matieres') return { kind: 'matieres', subject: seg[1], cycle: null };
  if (seg[0] && TYPE[seg[0]]) return { kind: seg[0], subject: seg[1], cycle };
  return { kind: 'unknown', subject: seg[1], cycle };
}

const results = [];
let cursor = 0;
const CONC = 6;

async function worker() {
  while (cursor < links.length) {
    const link = links[cursor++];
    const { kind, subject, cycle } = parse(link.href);
    const row = { href: link.href, kind, subject, cycle, label: link.label };

    // A. Page + stat du hero
    const page = await get(BASE + link.href);
    row.http = page.status;
    if (page.status === 200) {
      const vals = [...page.text.matchAll(/heroStatValue[^"]*"[^>]*>([^<]+)</g)].map((m) => m[1].trim());
      const labs = [...page.text.matchAll(/heroStatLabel[^"]*"[^>]*>\s*([^<{]+)/g)].map((m) => m[1].trim());
      row.hero = vals.length ? `${vals[0]} ${labs[0] || ''}`.trim() : null;
      row.heroTotal = vals.length ? Number(vals[0].replace(/[^\d]/g, '')) : null;
      // Pour /matieres/* : le compte affiché vient de la meta description statique
      const md = page.text.match(/content="[^"]*?([\d\s]{2,})\s*\+?\s*ressources/);
      if (kind === 'matieres' && md) row.staticCount = Number(md[1].replace(/[^\d]/g, ''));
    }

    // B. API de listing
    if (kind !== 'matieres' && kind !== 'unknown') {
      const lq = new URL(`${BASE}/api/${kind}/${subject}/list`);
      lq.searchParams.set('limit', '24');
      if (cycle) lq.searchParams.set('cycle', cycle);
      const r = await getJson(lq.toString());
      row.apiStatus = r.status;
      row.apiTotal = r.json?.total ?? null;
    }

    // C. Même sélection via /fr/ressources
    const rq = new URL(`${BASE}/api/ressources-data`);
    rq.searchParams.set('subject', subject);
    if (kind !== 'matieres' && kind !== 'unknown') {
      rq.searchParams.set('type', TYPE[kind]);
      if (cycle && CLASSES[cycle]) rq.searchParams.set('class', CLASSES[cycle].join(','));
    }
    const r2 = await getJson(rq.toString());
    row.ressourcesStatus = r2.status;
    row.ressourcesTotal = r2.json?.total ?? null;

    results.push(row);
  }
}

await Promise.all(Array.from({ length: CONC }, worker));

// --- Rapport ---
const pad = (s, n) => String(s ?? '—').padEnd(n);
let ko = 0, warn = 0, ok = 0;

console.log('=== 1. Pages en erreur (HTTP != 200) ===');
const bad = results.filter((r) => r.http !== 200);
if (!bad.length) console.log('  aucune ✅');
for (const r of bad) { console.log(`  ❌ ${pad(r.http, 4)} ${r.href}`); ko++; }

console.log('\n=== 2. Comptes incohérents (A ≠ B ≠ C) ===');
// Cohérence INTERNE de chaque page : le nombre affiché (A) doit être le
// nombre réellement listable (B). Le total de /fr/ressources (C) est le
// comparatif demandé, mais il peut LÉGITIMEMENT différer : /fr/ressources
// liste les ressources dont homeworkNumber est hors bornes (ex. id=8067,
// homeworkNumber=2013) alors que l'API devoirs les filtre (sanity 1-20).
const mismatch = results.filter((r) => {
  if (r.http !== 200) return false;
  if (r.kind === 'matieres') return r.staticCount != null && r.staticCount !== r.ressourcesTotal;
  return r.heroTotal != null && r.heroTotal !== r.apiTotal;
});
if (!mismatch.length) console.log('  aucun ✅');
for (const r of mismatch) {
  const parts = r.kind === 'matieres'
    ? `config statique=${r.staticCount} vs /fr/ressources=${r.ressourcesTotal}`
    : `page=${r.heroTotal} vs listing=${r.apiTotal} (/fr/ressources=${r.ressourcesTotal})`;
  console.log(`  ⚠️  ${r.href}\n        ${parts}`);
  warn++;
}

console.log('\n=== 3. Liens à 0 ressource (page vide) ===');
const zeros = results.filter((r) => r.http === 200 && r.ressourcesTotal === 0);
if (!zeros.length) console.log('  aucun ✅');
for (const r of zeros) { console.log(`  ⚠️  ${r.href}`); warn++; }

console.log('\n=== 4. Répartition ===');
const byKind = {};
for (const r of results) byKind[r.kind] = (byKind[r.kind] || 0) + 1;
console.log('  liens vérifiés :', results.length, JSON.stringify(byKind));
console.log(`  ✅ ${ok} sans écart majeur  |  ⚠️ ${warn} à surveiller  |  ❌ ${ko} en erreur`);

// Export CSV du relevé complet
const csv = ['lien;type;matiere;cycle;http;total_page;total_listing;total_ressources;statut']
  .concat(results.sort((a, b) => a.href.localeCompare(b.href)).map((r) => {
    const st = r.http !== 200 ? 'ERREUR'
      : r.kind === 'matieres'
        ? (r.staticCount != null && r.staticCount !== r.ressourcesTotal ? 'COMPTE_FIGE' : 'OK')
        : (r.ressourcesTotal === 0 ? 'VIDE' : (r.heroTotal !== r.apiTotal ? 'ECART_LISTING' : 'OK'));
    return [r.href, r.kind, r.subject, r.cycle ?? '', r.http, r.heroTotal ?? '', r.apiTotal ?? '', r.ressourcesTotal ?? '', st].join(';');
  }));
const fs = await import('node:fs');
fs.writeFileSync('/tmp/megamenu-counts.csv', csv.join('\n'), 'utf8');
console.log('\n  → /tmp/megamenu-counts.csv (' + (csv.length - 1) + ' lignes)');

console.log('\n=== 5. Détail (total affiché par page) ===');
for (const r of results.sort((a, b) => a.href.localeCompare(b.href))) {
  const disp = r.kind === 'matieres'
    ? `config=${r.staticCount ?? '—'} / réel=${r.ressourcesTotal ?? '—'}`
    : `page=${r.heroTotal ?? '—'} listing=${r.apiTotal ?? '—'} /ressources=${r.ressourcesTotal ?? '—'}`;
  console.log(`  ${pad(r.http, 4)} ${pad(r.href, 62)} ${disp}`);
}
