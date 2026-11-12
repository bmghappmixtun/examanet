#!/usr/bin/env node
/**
 * Vérifie la route de téléchargement des ressources.
 *
 * 2026-11-12 — le bouton bleu « Télécharger PDF » de TOUTES les ressources
 * renvoyait 502 (« Invalid URL »). Cause : `Resource.fileUrl` est un chemin
 * RELATIF (`/api/file/...`) et la route faisait `fetch(fileUrl)`.
 *
 * Ce script tire N ressources au hasard en D1 et vérifie que
 * `GET /api/resources/{numericId}/download` renvoie bien un PDF (200 +
 * Content-Type application/pdf + signature %PDF).
 *
 * Usage :
 *   node scripts/verify-download-route.mjs [baseUrl] [sampleSize]
 *   node scripts/verify-download-route.mjs https://examanet-dev.examanet-poc.workers.dev 8
 */

const BASE_URL = (process.argv[2] || 'https://examanet.com').replace(/\/+$/, '');
const SAMPLE_SIZE = parseInt(process.argv[3] || '8', 10);
const DB_ID = '22ad2e7f-1692-486e-9131-d6c4062012e1';

const PDF_MAGIC = Buffer.from('%PDF');

async function sampleIds() {
  const { execFileSync } = await import('node:child_process');
  const out = execFileSync(
    'npx',
    [
      'wrangler', 'd1', 'execute', DB_ID, '--remote', '--json',
      '--command',
      `SELECT numericId FROM Resource WHERE status='PUBLISHED' AND fileUrl LIKE '/api/file/%' ORDER BY RANDOM() LIMIT ${SAMPLE_SIZE}`,
    ],
    { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024, cwd: process.cwd() },
  );
  const parsed = JSON.parse(out);
  const rows = Array.isArray(parsed) ? parsed[0].results : parsed.results;
  return rows.map((r) => r.numericId);
}

async function check(id) {
  const url = `${BASE_URL}/api/resources/${id}/download`;
  const started = Date.now();
  const res = await fetch(url, { redirect: 'follow' });
  const elapsed = Date.now() - started;

  const contentType = res.headers.get('content-type') || '';
  const disposition = res.headers.get('content-disposition') || '';
  const backend = res.headers.get('x-storage-backend') || '-';

  if (res.status !== 200) {
    const body = (await res.text()).slice(0, 160);
    return { ok: false, id, status: res.status, note: body, elapsed };
  }

  // On ne télécharge que les 4 premiers octets pour vérifier la signature.
  const { body } = res;
  const reader = body.getReader();
  const { value } = await reader.read();
  await reader.cancel();

  const isPdf = value && value.length >= 4 && PDF_MAGIC.equals(Buffer.from(value.slice(0, 4)));

  return {
    ok: isPdf && contentType.includes('pdf') && disposition.includes('attachment'),
    id,
    status: res.status,
    contentType,
    disposition: disposition.slice(0, 60),
    backend,
    isPdf,
    elapsed,
  };
}

(async () => {
  console.log(`Base URL : ${BASE_URL}`);
  console.log(`Échantillon : ${SAMPLE_SIZE} ressource(s) tirée(s) en D1\n`);

  let ids;
  try {
    ids = await sampleIds();
  } catch (e) {
    console.error('✗ Impossible de tirer l\'échantillon D1 :', e.message);
    process.exit(2);
  }

  if (!ids.length) {
    console.error('✗ Aucune ressource trouvée en D1.');
    process.exit(2);
  }

  let failures = 0;
  for (const id of ids) {
    try {
      const r = await check(id);
      if (r.ok) {
        console.log(`✓ ${id} → 200 pdf=${r.isPdf} type=${r.contentType} backend=${r.backend} (${r.elapsed} ms)`);
      } else {
        failures++;
        console.log(`✗ ${id} → ${r.status} ${r.note || ''} type=${r.contentType || '-'} (${r.elapsed} ms)`);
      }
    } catch (e) {
      failures++;
      console.log(`✗ ${id} → exception : ${e.message}`);
    }
  }

  console.log(`\n${ids.length - failures}/${ids.length} téléchargements OK`);
  process.exit(failures ? 1 : 0);
})();
