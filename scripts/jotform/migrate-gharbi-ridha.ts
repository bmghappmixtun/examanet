#!/usr/bin/env -S npx tsx
/**
 * Migration: Import 91 files from JotForm (form: Tunisiecollege.net)
 * Teacher: GHARBI RIDHA (Ridha Gharbi) - existing in DB
 * Source: mounibtasnim@yahoo.fr submissions
 * 
 * Flow per file:
 *   1. Download from JotForm URL
 *   2. Detect format
 *   3. Upload original to Vercel Blob
 *   4. If not PDF, convert to PDF via iLoveAPI
 *   5. Upload converted PDF to Vercel Blob
 *   6. Create TeacherFile record (linked to teacher)
 *   7. Create Resource record (linked to libraryFile)
 *   8. NO notifications sent
 */

import { PrismaClient } from '@prisma/client';
import { put } from '@vercel/blob';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();
const API_KEY = process.env.JOTFORM_API_KEY!;
const BLOB_TOKEN = process.env.BLOB_READ_WRITE_TOKEN!;
const ILOVEAPI_KEY = process.env.I_LOVE_API_KEY!;
const ILOVEAPI_PUB = process.env.I_LOVE_API_PUBLIC_KEY!;

const TEACHER_ID = 'cmqj8v8c90002hqfuq6knpy3k'; // Ridha Gharbi
const TEACHER_EMAIL = 'mounibtasnim@yahoo.fr';

const INPUT_JSON = '/tmp/jotform-gharbi-ridha.json';
const LOG_FILE = '/tmp/jotform-migration.log';

function log(msg: string) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  fs.appendFileSync(LOG_FILE, line + '\n');
}

function detectFormat(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  if (ext === 'pdf') return 'pdf';
  if (ext === 'docx') return 'docx';
  if (ext === 'doc') return 'doc';
  if (ext === 'odt') return 'odt';
  if (ext === 'rtf') return 'rtf';
  if (ext === 'pptx' || ext === 'ppt') return ext;
  if (ext === 'xlsx' || ext === 'xls') return ext;
  return ext;
}

// Download file from JotForm URL
async function downloadFile(url: string): Promise<Buffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed: ${res.status} ${url}`);
  const ab = await res.arrayBuffer();
  return Buffer.from(ab);
}

// Upload buffer to Vercel Blob
async function uploadToBlob(buffer: Buffer, filename: string, teacherId: string): Promise<{ url: string; key: string }> {
  const key = `teacher-library/${teacherId}/${Date.now()}-${filename}`;
  const blob = await put(key, buffer, {
    access: 'public',
    token: BLOB_TOKEN,
    addRandomSuffix: false,
  });
  return { url: blob.url, key: blob.pathname };
}

// iLoveAPI conversion (PDF only)
async function convertToPdf(buffer: Buffer, filename: string): Promise<Buffer> {
  // Generate JWT
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const payload = Buffer.from(JSON.stringify({
    jti: ILOVEAPI_PUB,
    iss: 'api.ilovepdf.com',
    iat: now - 5,
    exp: now + 3300,
  })).toString('base64url');
  const crypto = await import('crypto');
  const signature = crypto.createHmac('sha256', ILOVEAPI_KEY)
    .update(`${header}.${payload}`).digest('base64url');
  const jwt = `${header}.${payload}.${signature}`;

  // 1. Start task
  const startRes = await fetch('https://api.ilovepdf.com/v1/start/officepdf', {
    headers: { Authorization: `Bearer ${jwt}` }
  });
  if (!startRes.ok) throw new Error(`iLoveAPI start failed: ${startRes.status}`);
  const start = await startRes.json();
  const server = start.server;
  const task = start.task;

  // 2. Upload file
  const form = new FormData();
  form.append('task', task);
  form.append('file', new Blob([buffer]), filename);
  const uploadRes = await fetch(`https://${server}.ilovepdf.com/v1/upload?task=${task}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${jwt}` },
    body: form,
  });
  if (!uploadRes.ok) throw new Error(`iLoveAPI upload failed: ${uploadRes.status}`);
  const upload = await uploadRes.json();
  const serverFilename = upload.server_filename;

  // 3. Process
  const processRes = await fetch(`https://${server}.ilovepdf.com/v1/process?task=${task}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ server_filename: serverFilename }),
  });
  if (!processRes.ok) throw new Error(`iLoveAPI process failed: ${processRes.status}`);

  // 4. Download
  const dlRes = await fetch(`https://${server}.ilovepdf.com/v1/download/${task}`, {
    headers: { Authorization: `Bearer ${jwt}` }
  });
  if (!dlRes.ok) throw new Error(`iLoveAPI download failed: ${dlRes.status}`);
  return Buffer.from(await dlRes.arrayBuffer());
}

async function processFile(sub: any, file: { url: string; name: string }, idx: number, total: number) {
  const filename = decodeURIComponent(file.name || 'file.pdf');
  const format = detectFormat(filename);
  log(`[${idx}/${total}] Processing: ${filename} (${format})`);

  // 1. Download from JotForm
  log(`  - Downloading...`);
  const originalBuffer = await downloadFile(file.url);
  log(`  - Downloaded ${originalBuffer.length} bytes`);

  // 2. Upload original to Blob
  const originalUpload = await uploadToBlob(originalBuffer, filename, TEACHER_ID);
  log(`  - Uploaded original: ${originalUpload.key}`);

  let pdfUpload: { url: string; key: string } | null = null;
  let conversionStatus = 'NOT_NEEDED';
  let pdfBuffer: Buffer | null = null;

  if (format !== 'pdf') {
    log(`  - Converting to PDF via iLoveAPI...`);
    try {
      pdfBuffer = await convertToPdf(originalBuffer, filename);
      const pdfFilename = filename.replace(/\.[^.]+$/, '.pdf');
      pdfUpload = await uploadToBlob(pdfBuffer, pdfFilename, TEACHER_ID);
      conversionStatus = 'SUCCESS';
      log(`  - PDF converted (${pdfBuffer.length} bytes) and uploaded: ${pdfUpload.key}`);
    } catch (e: any) {
      conversionStatus = 'FAILED';
      log(`  - PDF conversion FAILED: ${e.message}`);
    }
  }

  // 3. Create TeacherFile
  const teacherFile = await prisma.teacherFile.create({
    data: {
      teacherId: TEACHER_ID,
      fileName: filename,
      originalFormat: format,
      fileKey: originalUpload.key,
      fileUrl: originalUpload.url,
      fileSize: originalBuffer.length,
      pdfKey: pdfUpload?.key || null,
      pdfUrl: pdfUpload?.url || null,
      pdfSize: pdfBuffer?.length || null,
      conversionStatus,
      notes: `Migrated from JotForm ${sub.formName} submission ${sub.submissionId} (${new Date(sub.createdAt).toISOString().slice(0, 10)})`,
    },
  });
  log(`  - TeacherFile created: ${teacherFile.id}`);

  // 4. Create Resource (use PDF if available, else original)
  const resourceUrl = pdfUpload?.url || originalUpload.url;
  const resourceSize = pdfBuffer?.length || originalBuffer.length;
  const resource = await prisma.resource.create({
    data: {
      title: filename.replace(/\.[^.]+$/, ''),
      description: `Importé depuis JotForm (${sub.formName}) - ${new Date(sub.createdAt).toISOString().slice(0, 10)}`,
      type: 'COURSE',
      status: 'PUBLISHED', // auto-publish imported content
      fileKey: pdfUpload?.key || originalUpload.key,
      fileUrl: resourceUrl,
      fileSize: resourceSize,
      originalFileKey: originalUpload.key,
      originalFileName: filename,
      originalFormat: format,
      originalFileSize: originalBuffer.length,
      libraryFileId: teacherFile.id,
      uploadedById: TEACHER_ID,
      approvedById: TEACHER_ID, // self-approved since teacher trusted
      approvedAt: new Date(),
      publishedAt: new Date(),
    },
  });
  log(`  - Resource created: ${resource.id}`);

  // 5. Link teacherFile.resourceId (for backwards reference)
  await prisma.teacherFile.update({
    where: { id: teacherFile.id },
    data: { resourceId: resource.id },
  });

  return { teacherFileId: teacherFile.id, resourceId: resource.id };
}

async function main() {
  log('=== JotForm Migration: GHARBI RIDHA ===');

  // 1. Update teacher email
  log(`Updating teacher email to ${TEACHER_EMAIL}...`);
  await prisma.user.update({
    where: { id: TEACHER_ID },
    data: { email: TEACHER_EMAIL },
  });
  log('Email updated');

  // 2. Load JotForm data
  const allSubs: any[] = JSON.parse(fs.readFileSync(INPUT_JSON, 'utf-8'));
  // Filter: only mounibtasnim@yahoo.fr submissions
  const subs = allSubs.filter(s => s.teacherEmail === TEACHER_EMAIL);
  log(`Found ${subs.length} submissions to migrate`);

  // 3. Process each file
  let fileIdx = 0;
  const total = subs.reduce((s, x) => s + x.fileCount, 0);
  for (const sub of subs) {
    for (const file of sub.files) {
      fileIdx++;
      try {
        await processFile(sub, file, fileIdx, total);
      } catch (e: any) {
        log(`  !!! ERROR on ${file.name}: ${e.message}`);
        log(`  Stack: ${e.stack}`);
      }
      // Rate limit: 1s between iLoveAPI calls to be safe
      await new Promise(r => setTimeout(r, 1000));
    }
  }

  log(`=== Migration complete: ${fileIdx} files processed ===`);
  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
