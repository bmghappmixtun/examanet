#!/usr/bin/env node
/**
 * Croisement croisé des 141 liens du méga-menu — 3 sources indépendantes.
 *
 *   S1  BASE  : COUNT(*) sur D1 (via l'API prod exposée par /api/matieres/list
 *               n'expose pas le détail → on passe par les totaux déjà relevés
 *               dans la matrice, see MATRIX ci-dessous)
 *   S2  /fr/ressources : GET /api/ressources-data avec les filtres équivalents
 *               (subject + type + class) → le total de la MÊME sélection
 *   S3  AFFICHÉ : le nombre que l'utilisateur lit sur la page (stat du hero)
 *
 * Règle : S1 == S2 == S3 → le lien est juste.
 *
 * Usage: node scripts/crosscheck-megamenu.mjs <baseUrl> <links.json> <matrix.json>
 */
import { readFileSync } from 'node:fs';

const BASE = process.argv[2] || 'https://examanet.com';
const LINKS_FILE = process.argv[3] || '/tmp/mm-links-new.json';
const MATRIX_FILE = process.argv[4] || '/tmp/mm-matrix.json';

const CLASSES = {
  college: ['7eme', '8eme', '9eme'],
  lycee: ['1ere-secondaire', '2eme-secondaire', '3eme-secondaire', '4eme-secondaire'],
};
const TYPE = { devoirs: 'DEVOIR', series: 'EXERCISE', cours: 'COURSE' };

const raw = JSON.parse(readFileSync(LINKS_FILE, 'utf8'));
const matrix = JSON.parse(readFileSync(MATRIX_FILE, 'utf8'));

const links = [...new Map(
  [...raw.college, ...raw.lycee].map((l) => [l.href, l])
).values()].sort((a, b) => a.href.localeCompare(b.href));

function parse(href) {
  const u = new URL(href, BASE);
  const seg = u.pathname.replace(/^\/(fr|ar)\//, '').split('/');
  const cycle = u.searchParams.get('cycle');
  if (seg[0] === 'matieres') return { kind: 'matieres', subject: seg[1], cycle: null };
  if (seg[0] && TYPE[seg[0]]) return { kind: seg[0], subject: seg[1], cycle };
  return { kind: 'unknown', subject: seg[1], cycle };
}

async function get(url) {
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(45000) });
      return { status: r.status, text: await r.text() };
    } catch (e) {
      if (i === 2) return { status: 0, text: '' };
      await new Promise((r) => setTimeout(r, 1200));
    }
  }
}

let cursor = 0;
const results = [];

async function worker() {
  while (cursor < links.length) {
    const link = links[cursor++];
    const { kind, subject, cycle } = parse(link.href);
    const row = { href: link.href, kind, subject, cycle };

    // S1 — BASE
    const m = matrix[subject];
    if (kind === 'matieres') {
      row.s1 = m ? m.all : null;
    } else if (m && m.types) {
      const t = m.types[TYPE[kind]];
      row.s1 = t ? (cycle === 'college' ? t.college : t.lycee) : null;
    } else {
      row.s1 = null;
    }

    // S2 — /fr/ressources (API équivalente)
    const rq = new URL(`${BASE}/api/ressources-data`);
    rq.searchParams.set('subject', subject);
    if (kind !== 'matieres') {
      rq.searchParams.set('type', TYPE[kind]);
      if (cycle && CLASSES[cycle]) rq.searchParams.set('class', CLASSES[cycle].join(','));
    }
    const r2 = await get(rq.toString());
    try { row.s2 = JSON.parse(r2.text)?.total ?? null; } catch { row.s2 = null; }

    // S3 — affichage
    const page = await get(BASE + link.href);
    row.http = page.status;
    if (page.status === 200) {
      const vals = [...page.text.matchAll(/heroStatValue[^"]*"[^>]*>([^<]+)</g)].map((m) => m[1].trim());
      row.s3 = vals.length ? Number(vals[0].replace(/[^\d]/g, '')) : null;
    } else {
      row.s3 = null;
    }

    results.push(row);
  }
}

await Promise.all(Array.from({ length: 6 }, worker));

results.sort((a, b) => a.href.localeCompare(b.href));

// --- Verdict ---
const rows = [];
let concordants = 0, ecarts = 0, vides = 0, erreurs = 0;

for (const r of results) {
  let verdict, detail;
  if (r.http !== 200) {
    verdict = 'ERREUR_HTTP'; erreurs++;
    detail = `http=${r.http}`;
  } else if (r.s2 === 0) {
    verdict = 'PAGE_VIDE'; vides++;
    detail = `base=${r.s1 ?? '—'} /ressources=0 / affiché=${r.s3 ?? '—'}`;
  } else if (r.s1 != null && r.s2 != null && r.s1 !== r.s2) {
    verdict = 'ECART_BASE'; ecarts++;
    detail = `base=${r.s1} /ressources=${r.s2} / affiché=${r.s3 ?? '—'}`;
  } else if (r.s3 != null && r.s2 != null && r.s3 !== r.s2) {
    verdict = 'ECART_AFFICHAGE'; ecarts++;
    detail = `base=${r.s1 ?? '—'} /ressources=${r.s2} / affiché=${r.s3}`;
  } else {
    verdict = 'CONCORDANT'; concordants++;
    detail = `${r.s2}`;
  }
  rows.push({ ...r, verdict, detail });
}

console.log('=== VERDICT GLOBAL (141 liens) ===');
console.log(`  ✅ concordants (base = /fr/ressources = affiché) : ${concordants}`);
console.log(`  ⚠️  écart de compte                              : ${ecarts}`);
console.log(`  ⚠️  page vide (0 ressource)                      : ${vides}`);
console.log(`  ❌ erreur HTTP                                   : ${erreurs}`);

const bad = rows.filter((r) => r.verdict !== 'CONCORDANT');
if (bad.length) {
  console.log('\n=== DÉTAIL DES ANOMALIES ===');
  for (const r of bad) console.log(`  ${r.verdict.padEnd(16)} ${r.href.padEnd(52)} ${r.detail}`);
}

console.log('\n=== TOUS LES LIENS (base | /fr/ressources | affiché) ===');
for (const r of rows) {
  console.log(`  ${r.verdict.padEnd(16)} ${r.href.padEnd(52)} base=${String(r.s1 ?? '—').padEnd(6)} /res=${String(r.s2 ?? '—').padEnd(6)} aff=${String(r.s3 ?? '—').padEnd(6)}`);
}

const fs = await import('node:fs');
const csv = ['lien;type;matiere;cycle;http;base;total_ressources;total_affiche;verdict']
  .concat(rows.map((r) => [r.href, r.kind, r.subject, r.cycle ?? '', r.http ?? '', r.s1 ?? '', r.s2 ?? '', r.s3 ?? '', r.verdict].join(';')));
fs.writeFileSync('/tmp/megamenu-crosscheck.csv', csv.join('\n'), 'utf8');
console.log('\n  → /tmp/megamenu-crosscheck.csv');
