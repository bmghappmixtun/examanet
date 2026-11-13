#!/usr/bin/env node
/**
 * Restaure dans R2 les PDF « orphelines » (copie R2 absente après l'incident
 * du 22/09/2026) en les récupérant depuis le store Vercel Blob d'origine,
 * qui est toujours en ligne et sert les objets sous le MÊME chemin.
 *
 * 2026-11-13 — 573 des 574 PDF ont été retrouvés sur Vercel (448,5 Mo).
 * L'écriture se fait sous la clé EXACTE attendue par la route de
 * téléchargement (`Resource.fileUrl` → `/api/file/<clé>`), donc aucun code
 * applicatif ne change : le bouton « Télécharger PDF » repart tout seul.
 *
 * Sûreté : on n'écrit QUE sur des clés absentes de R2 (HEAD préalable) →
 * aucune donnée existante n'est écrasée.
 *
 * Variables d'environnement requises :
 *   R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET
 *
 * Usage :
 *   node scripts/restore-orphan-pdfs-from-vercel.mjs           # dry-run
 *   node scripts/restore-orphan-pdfs-from-vercel.mjs --apply   # écriture réelle
 */

import { readFileSync } from 'node:fs';
import { S3Client, HeadObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';

const APPLY = process.argv.includes('--apply');
const BLOB_HOST = 'https://kmy1h6us8l7bg7bg.public.blob.vercel-storage.com/';
const CSV_IN = 'output/orphan-vercel-alive-2026-11-13.csv';
const CONCURRENCY = 8;

const required = ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY'];
const missing = required.filter((k) => !process.env[k]);
if (missing.length) {
  console.error(`✗ Variables d'environnement manquantes : ${missing.join(', ')}`);
  console.error('  Charge-les depuis .env.local avant de lancer le script.');
  process.exit(2);
}

// ATTENTION : `R2_BUCKET` de .env.local vaut « examanet-architecture » (backup
// du CODE, 3 objets). Les PDF vivent dans « examanet-pdf-prod » (binding
// PDFS_BUCKET du worker). On cible donc explicitement le bucket des PDF.
const BUCKET = process.env.R2_PDF_BUCKET || 'examanet-pdf-prod';
if (process.env.R2_BUCKET && process.env.R2_BUCKET !== BUCKET) {
  console.log(`ℹ R2_BUCKET="${process.env.R2_BUCKET}" ignoré : cible = ${BUCKET} (bucket des PDF)`);
}
const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

function parseCsv(text) {
  const lines = text.replace(/^\uFEFF/, '').split('\n').filter(Boolean);
  const header = lines[0].split(',');
  return lines.slice(1).map((line) => {
    const cells = [];
    let cur = '';
    let quoted = false;
    for (const ch of line) {
      if (ch === '"') quoted = !quoted;
      else if (ch === ',' && !quoted) { cells.push(cur); cur = ''; }
      else cur += ch;
    }
    cells.push(cur);
    const obj = {};
    header.forEach((h, i) => { obj[h] = cells[i] ?? ''; });
    return obj;
  });
}

async function keyExists(key) {
  try {
    await s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key: key }));
    return true;
  } catch (e) {
    if (e?.$metadata?.httpStatusCode === 404 || e?.name === 'NotFound') return false;
    throw e;
  }
}

async function restore(row) {
  const key = row.r2Key;
  if (await keyExists(key)) {
    return { key, status: 'déjà présent', bytes: Number(row.size || 0) };
  }
  const res = await fetch(BLOB_HOST + key, { headers: { 'User-Agent': 'Examanet-Restore/1.0' } });
  if (!res.ok) {
    return { key, status: `source HTTP ${res.status}`, bytes: 0 };
  }
  const body = Buffer.from(await res.arrayBuffer());
  if (!body.subarray(0, 4).toString('latin1').startsWith('%PDF')) {
    return { key, status: 'source non-PDF', bytes: body.length };
  }
  if (!APPLY) {
    return { key, status: 'ok (dry-run)', bytes: body.length };
  }
  await s3.send(new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    Body: body,
    ContentType: 'application/pdf',
    Metadata: { restoredFrom: 'vercel-blob', restoredAt: new Date().toISOString() },
  }));
  return { key, status: 'restauré', bytes: body.length };
}

(async () => {
  const rows = parseCsv(readFileSync(CSV_IN, 'utf8'));
  console.log(`Mode : ${APPLY ? 'ÉCRITURE RÉELLE' : 'dry-run'}`);
  console.log(`Bucket R2 : ${BUCKET}`);
  console.log(`PDF à restaurer : ${rows.length}\n`);

  let done = 0;
  let totalBytes = 0;
  const stats = {};
  const failures = [];
  const queue = [...rows];

  async function worker() {
    while (queue.length) {
      const row = queue.shift();
      try {
        const r = await restore(row);
        stats[r.status] = (stats[r.status] || 0) + 1;
        if (r.status === 'restauré' || r.status === 'ok (dry-run)') totalBytes += r.bytes;
        else if (!r.status.startsWith('déjà')) failures.push(r);
        done++;
        if (done % 25 === 0) console.log(`  ${done}/${rows.length}…`);
      } catch (e) {
        failures.push({ key: row.r2Key, status: `exception: ${e?.message}`, bytes: 0 });
        done++;
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));

  console.log('\n=== Bilan ===');
  for (const [k, v] of Object.entries(stats)) console.log(`  ${k} : ${v}`);
  console.log(`  volume traité : ${(totalBytes / 1024 / 1024).toFixed(1)} Mo`);
  if (failures.length) {
    console.log(`\nÉchecs (${failures.length}) :`);
    failures.slice(0, 20).forEach((f) => console.log(`  ${f.status} ${f.key}`));
  }
  if (!APPLY) {
    console.log('\n(dry-run : rien n\'a été écrit — relance avec --apply pour restaurer)');
  }
  process.exit(failures.length ? 1 : 0);
})();
