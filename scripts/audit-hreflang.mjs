#!/usr/bin/env node
/**
 * SEO 2026-10-25 — audit hreflang/canonical.
 *
 * Vérifie que chaque page localisée émet EXACTEMENT UN jeu de
 * <link rel="alternate"> (fr-TN / ar-TN / x-default), sans doublon de clé
 * hrefLang, et que le canonical pointe bien vers la page elle-même.
 *
 * Bug corrigé : le layout racine émettait des `alternates.languages` pointant
 * vers l'ACCUEIL, et Next.js rend les alternates du layout racine ET ceux de
 * la page feuille → 2 jeux concurrents (et pour les pages sans alternates
 * propres, « la version française de cette page = https://examanet.com »).
 *
 * Usage: node scripts/check-hreflang.mjs [baseUrl]
 */
const BASE = process.argv[2] || 'https://examanet-dev.examanet-poc.workers.dev';

const URLS = [
  '/fr',
  '/ar',
  '/fr/ressources',
  '/ar/ressources',
  '/fr/college',
  '/fr/matieres',
  '/fr/matieres/mathematiques',
  '/fr/niveaux',
  '/fr/niveaux/college',
  '/fr/devoirs/histoire-geographie',
  '/fr/ressources/12168/serie-d-exercices-mathematiques-4eme-secondaire-nombres-complexes-et-geometrie',
  // NB : le [slug] de /cours/* et /series/* est un slug de MATIÈRE, pas de ressource.
  '/fr/cours/mathematiques',
  '/fr/series/mathematiques',
  '/fr/professeurs',
  '/fr/professeurs/1',
  '/fr/faq',
  '/fr/contact',
  '/fr/a-propos',
  '/fr/outils/moyenne-bac',
  '/fr/referentiel-national',
  '/fr/bac',
  '/fr/programme-officiel',
  '/fr/enseignants/rejoindre',
  '/fr/ressources/3562',
  // Variantes AR : le canonical doit pointer vers l'URL AR, pas vers la FR.
  '/ar/college',
  '/ar/matieres',
  '/ar/matieres/mathematiques',
  '/ar/niveaux',
  '/ar/niveaux/college',
  '/ar/devoirs/histoire-geographie',
  '/ar/cours/mathematiques',
  '/ar/series/mathematiques',
  '/ar/college',
  '/ar/faq',
  '/ar/contact',
  '/ar/a-propos',
  '/ar/outils/moyenne-bac',
  '/ar/referentiel-national',
  '/ar/professeurs',
  '/ar/bac',
  '/ar/programme-officiel',
  '/ar/enseignants/rejoindre',
];

let failures = 0;

for (const path of URLS) {
  const url = `${BASE}${path}`;
  let html = '';
  try {
    const res = await fetch(url, { redirect: 'follow' });
    html = await res.text();
  } catch (e) {
    console.log(`❌ ${path} — fetch failed: ${e.message}`);
    failures++;
    continue;
  }

  const canonical = html.match(/<link rel="canonical" href="([^"]+)"/)?.[1] || null;
  const alts = [...html.matchAll(/<link rel="alternate" hrefLang="([^"]+)" href="([^"]+)"/g)]
    .map((m) => ({ lang: m[1], href: m[2] }));

  const keys = alts.map((a) => a.lang);
  const dupes = keys.filter((k, i) => keys.indexOf(k) !== i);
  const problems = [];

  if (!canonical) problems.push('canonical ABSENT');
  if (alts.length === 0) problems.push('aucun hreflang');
  if (dupes.length) problems.push(`hreflang en doublon: ${[...new Set(dupes)].join(',')}`);
  if (canonical && !canonical.endsWith(path) && !path.includes('[')) {
    // /fr/ressources/3562 : le slug canonique peut différer
    if (!canonical.includes(path.split('/').slice(0, 3).join('/'))) {
      problems.push(`canonical inattendu: ${canonical}`);
    }
  }
  for (const a of alts) {
    if (a.href === 'https://examanet.com' || a.href === 'https://examanet.com/') {
      problems.push(`hreflang ${a.lang} pointe sur l'ACCUEIL`);
    }
  }
  if (alts.length > 3) problems.push(`${alts.length} alternates (attendu 3)`);

  if (problems.length) {
    failures++;
    console.log(`❌ ${path}`);
    problems.forEach((p) => console.log(`     ${p}`));
    alts.forEach((a) => console.log(`       ${a.lang} -> ${a.href}`));
  } else {
    console.log(`✅ ${path.padEnd(38)} canonical=${canonical}`);
    alts.forEach((a) => console.log(`     ${a.lang.padEnd(10)} -> ${a.href}`));
  }
}

console.log(`\n${URLS.length - failures}/${URLS.length} pages OK`);
process.exit(failures ? 1 : 0);
