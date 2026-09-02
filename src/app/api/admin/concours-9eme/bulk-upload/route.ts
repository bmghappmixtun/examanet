/**
 * Bulk upload Concours 9ème PDFs to Vercel Blob.
 *
 * This route is INTENTIONALLY protected by SEED_TOKEN (admin secret).
 * It runs on Vercel, so Vercel Blob auth is auto-detected via OIDC — no token needed.
 *
 * POST /api/admin/concours-9eme/bulk-upload
 * Body: { files: [{ key: string, sourceUrl: string }] }
 *   key:       Blob key to use (e.g. "concours-9eme/officials/2024/general/math.pdf")
 *   sourceUrl: External URL to fetch (9web.edunet.tn or ecoles.com.tn)
 *
 * Returns: {
 *   uploaded: [{ key, url, size }],
 *   failed:   [{ key, sourceUrl, error }]
 * }
 *
 * Usage limit: max 20 files per call (to stay within Vercel function timeouts).
 */
import { NextRequest, NextResponse } from 'next/server';
import { put } from '@vercel/blob';

export const maxDuration = 300; // 5 min for Pro plan
export const runtime = 'nodejs';

const MAX_FILES_PER_BATCH = 20;
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB safety cap

interface FileTask {
  key: string;
  sourceUrl: string;
}

async function fetchAsBuffer(url: string): Promise<Buffer> {
  const res = await fetch(url, {
    redirect: 'follow',
    headers: { 'User-Agent': 'Examanet-BulkUpload/1.0' },
  });
  if (!res.ok) {
    throw new Error(`Fetch ${url}: HTTP ${res.status}`);
  }
  const contentLength = parseInt(res.headers.get('content-length') || '0', 10);
  if (contentLength > MAX_FILE_SIZE) {
    throw new Error(`File too large: ${contentLength} bytes`);
  }
  const arrayBuf = await res.arrayBuffer();
  return Buffer.from(arrayBuf);
}

export async function POST(req: NextRequest) {
  // Auth: SEED_TOKEN only (matches other admin routes)
  const token = req.nextUrl.searchParams.get('token') || req.headers.get('x-seed-token');
  if (token !== process.env.SEED_TOKEN) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { files?: FileTask[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const files = body.files || [];
  if (files.length === 0) {
    return NextResponse.json({ error: 'No files provided' }, { status: 400 });
  }
  if (files.length > MAX_FILES_PER_BATCH) {
    return NextResponse.json(
      { error: `Too many files in batch: ${files.length} (max ${MAX_FILES_PER_BATCH})` },
      { status: 400 },
    );
  }

  const uploaded: Array<{ key: string; url: string; size: number }> = [];
  const failed: Array<{ key: string; sourceUrl: string; error: string }> = [];

  // Process in parallel (within the batch)
  await Promise.all(
    files.map(async (task) => {
      try {
        const buf = await fetchAsBuffer(task.sourceUrl);
        if (buf.length === 0) {
          failed.push({ ...task, error: 'Empty file' });
          return;
        }
        const blob = await put(task.key, buf, {
          access: 'public',
          contentType: 'application/pdf',
          addRandomSuffix: false, // We control the key for predictable URLs
          allowOverwrite: true,
        });
        uploaded.push({ key: blob.pathname, url: blob.url, size: buf.length });
      } catch (e: any) {
        failed.push({ ...task, error: e.message || 'Unknown error' });
      }
    }),
  );

  return NextResponse.json({
    success: uploaded.length,
    failed: failed.length,
    uploaded,
    failed_details: failed,
  });
}

// Convenience GET for health check
export async function GET() {
  return NextResponse.json({
    status: 'ok',
    endpoint: 'concours-9eme bulk upload',
    max_per_batch: MAX_FILES_PER_BATCH,
    auth: 'requires SEED_TOKEN',
  });
}
