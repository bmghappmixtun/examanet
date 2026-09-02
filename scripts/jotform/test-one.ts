import { PrismaClient } from '@prisma/client';
import { put } from '@vercel/blob';
import * as fs from 'fs';

const prisma = new PrismaClient();
const TEACHER_ID = 'cmqj8v8c90002hqfuq6knpy3k';
const BLOB_TOKEN = process.env.BLOB_READ_WRITE_TOKEN!;

async function downloadFile(url: string): Promise<Buffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

async function main() {
  const data = JSON.parse(fs.readFileSync('/tmp/jotform-gharbi-ridha.json', 'utf-8'));
  const sub = data.find((s: any) => s.teacherEmail === 'mounibtasnim@yahoo.fr' && s.files.length > 0);
  if (!sub) { console.log('No sub found'); return; }
  const file = sub.files[0];
  console.log('Testing file:', file.name);
  console.log('From submission:', sub.submissionId);

  // Download
  const buf = await downloadFile(file.url);
  console.log('Downloaded:', buf.length, 'bytes');
  console.log('First 4 bytes:', buf.slice(0, 4).toString());

  // Upload
  const key = `teacher-library/${TEACHER_ID}/test-${Date.now()}-${decodeURIComponent(file.name)}`;
  const blob = await put(key, buf, { access: 'public', token: BLOB_TOKEN, addRandomSuffix: false });
  console.log('Uploaded:', blob.url);

  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
