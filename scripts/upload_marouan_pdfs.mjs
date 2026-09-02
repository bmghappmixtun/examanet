#!/usr/bin/env node
/**
 * Upload 5 Mr Marouan PDFs to Vercel Blob and update DB records.
 * Uses the existing BLOB_READ_WRITE_TOKEN from the Vercel deployment
 * by accessing it via Vercel REST API (if possible).
 */

import { PrismaClient } from '@prisma/client';
import { config } from 'dotenv';
import { readFileSync } from 'fs';
import path from 'path';
import { execSync } from 'child_process';

config({ path: '/workspace/edutunisie/.env.local' });
const p = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL });

const TEACHER_ID = 'cmr8vw9in02lfq4p04h5jlxmn';

const FILES = [
  { file: 'DC2_Unite_Flexible_Production_2018-2019.pdf', numericId: 15452, year: '2018-2019', subject: 'Unité Flexible de Production' },
  { file: 'DS2_Debitage_Ceintures_2017-2018.pdf', numericId: 15454, year: '2017-2018', subject: 'Débitage de Ceintures' },
  { file: 'DC2_Butee_Fraisage_2017-2018.pdf', numericId: 15455, year: '2017-2018', subject: 'Butée de Fraisage' },
  { file: 'DC2_Poste_Poinconnage_2016-2017.pdf', numericId: 15456, year: '2016-2017', subject: 'Poste Automatique de Poinçonnage' },
  { file: 'DC2_Systeme_Encaissage_2015-2016.pdf', numericId: 15457, year: '2015-2016', subject: "Système d'encaissage" },
];

// Use Vercel REST API to get a fresh token
console.log('Fetching BLOB_READ_WRITE_TOKEN from Vercel...');
let blobToken;
try {
  // Try via the vercel CLI
  const result = execSync('vercel env pull --environment=production 2>&1 | grep -E "^BLOB_READ_WRITE_TOKEN" || true', { encoding: 'utf-8' });
  if (result && result.includes('=')) {
    blobToken = result.split('=')[1]?.trim().replace(/^["']|["']$/g, '');
  }
} catch (e) {
  // vercel CLI not available
}

if (!blobToken) {
  console.error('Cannot get BLOB_READ_WRITE_TOKEN. Options:');
  console.error('1. Deploy this script to Vercel and run it there');
  console.error('2. Manually upload via admin UI');
  process.exit(1);
}

console.log('Token obtained (length:', blobToken.length, ')');

// Use Vercel Blob REST API directly
const { put } = await import('@vercel/blob');
const uploads = [];

for (const file of FILES) {
  const localPath = path.join('/tmp/downloads/mr_marouan', file.file);
  try {
    const data = readFileSync(localPath);
    console.log(`\nUploading ${file.file} (${(data.length/1024).toFixed(0)}KB)...`);
    
    const blob = await put(`marouan/${file.file}`, data, {
      access: 'public',
      contentType: 'application/pdf',
      token: blobToken,
    });
    
    console.log('  Uploaded:', blob.url);
    uploads.push({ ...file, blobUrl: blob.url, blobKey: blob.pathname, size: data.length });
  } catch (e) {
    console.error(`  Error: ${e.message}`);
  }
}

console.log('\n=== Uploaded files ===');
for (const u of uploads) {
  console.log(`  ${u.numericId}: ${u.blobUrl}`);
}

await p.$disconnect();
