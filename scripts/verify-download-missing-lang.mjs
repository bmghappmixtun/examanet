#!/usr/bin/env node
/**
 * Vérifie que la page « document absent du stockage » est servie dans la
 * LANGUE DE LA RESSOURCE (et non dans la langue du navigateur).
 *
 * 2026-11-12 — bug : la langue venait de l'en-tête `Accept-Language`, donc un
 * document arabe renvoyait « Document indisponible » en français pour un
 * visiteur francophone (et inversement).
 *
 * Ce script tire des ressources PUBLISHED dont l'objet R2 est absent
 * (les « orphelines », cf. output/orphan-resources-2026-11-12.csv) et vérifie
 * que `GET /api/resources/{numericId}/download` renvoie :
 *   - 404 + `X-Document-Status: missing-in-storage`
 *   - `Content-Language` = langue de la ressource
 *   - un corps dans la bonne langue (titre FR ou AR)
 *
 * Usage :
 *   node scripts/verify-download-missing-lang.mjs [baseUrl] [sampleSize]
 *   node scripts/verify-download-missing-lang.mjs https://examanet.com 10
 */

import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const BASE_URL = (process.argv[2] || 'https://examanet.com').replace(/\/+$/, '');
const SAMPLE_SIZE = parseInt(process.argv[3] || '10', 10);
const DB_ID = '22ad2e7f-1692-486e-9131-d6c4062012e1';
const CSV_PATH = 'output/orphan-resources-2026-11-12.csv';

const TITLES = {
  fr: 'Document indisponible',
  ar: 'الوثيقة غير متوفرة',
};

function readOrphanIds() {
  const csv = readFileSync(CSV_PATH, 'utf8').replace(/^\uFEFF/, '');
  const rows = csv.split('\n').slice(1).filter(Boolean);
  const ids = rows
    .map((line) => {
      // numericId est le 1er champ ; le titre peut contenir des virgules.
      const m = line.match(/^(\d+),/);
      return m ? parseInt(m[1], 10) : null;
    })
    .filter((n) => n !== null);
  if (!ids.length) {
    throw new Error(`CSV vide ou illisible : ${CSV_PATH}`);
  }
  return ids;
}

function languageOf(ids) {
  const list = ids.join(',');
  const out = execFileSync(
    'npx',
    [
      'wrangler', 'd1', 'execute', DB_ID, '--remote', '--json',
      '--command',
      `SELECT numericId, language FROM Resource WHERE numericId IN (${list})`,
    ],
    { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024, cwd: process.cwd() },
  );
  const parsed = JSON.parse(out);
  const rows = Array.isArray(parsed) ? parsed[0].results : parsed.results;
  return rows.map((r) => ({ id: r.numericId, lang: (r.language || 'fr').toLowerCase() }));
}

(async () => {
  console.log(`Base URL : ${BASE_URL}`);
  let orphans;
  try {
    const ids = readOrphanIds();
    orphans = languageOf(ids);
  } catch (e) {
    console.error("✗ Impossible de lire la liste des orphelines :", e.message);
    process.exit(2);
  }

  // On garde au moins un FR et un AR quand c'est possible.
  const pick = [];
  const seen = new Set();
  for (const want of ['ar', 'fr']) {
    for (const o of orphans) {
      if (o.lang === want && !seen.has(o.id)) {
        pick.push(o);
        seen.add(o.id);
        break;
      }
    }
  }
  for (const o of orphans) {
    if (pick.length >= SAMPLE_SIZE) break;
    if (!seen.has(o.id)) {
      pick.push(o);
      seen.add(o.id);
    }
  }

  console.log(`Échantillon : ${pick.length} ressource(s) orpheline(s)\n`);

  let failures = 0;
  for (const { id, lang } of pick) {
    const url = `${BASE_URL}/api/resources/${id}/download`;
    try {
      const res = await fetch(url, { redirect: 'follow' });
      const body = await res.text();
      const contentLanguage = (res.headers.get('content-language') || '').toLowerCase();
      const status = res.headers.get('x-document-status') || '-';
      const hasTitle = body.includes(TITLES[lang]);
      const ok =
        res.status === 404 &&
        status === 'missing-in-storage' &&
        contentLanguage.startsWith(lang) &&
        hasTitle;
      if (ok) {
        console.log(`✓ ${id} (lang=${lang}) → 404 ${contentLanguage} « ${TITLES[lang]} »`);
      } else {
        failures++;
        console.log(
          `✗ ${id} (lang=${lang}) → ${res.status} ${contentLanguage} status=${status} ` +
            `titre-attendu=${hasTitle} lang-attendu=${lang}`,
        );
      }
    } catch (e) {
      failures++;
      console.log(`✗ ${id} → exception : ${e.message}`);
    }
  }

  console.log(`\n${pick.length - failures}/${pick.length} pages d'erreur dans la bonne langue`);
  process.exit(failures ? 1 : 0);
})();
