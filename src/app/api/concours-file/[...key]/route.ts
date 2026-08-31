// @ts-nocheck
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getOriginalConcoursFiles } from '@/lib/concours-9eme-data';
import { getOriginalBacFiles } from '@/lib/bac-data';

function sanitizeFilename(name: string): string {
  return name
    .replace(/[\x00-\x1F\x7F]/g, '')
    .replace(/[<>:"/\\|?*]/g, '_')
    .substring(0, 200);
}

function getFilenameFromKey(key: string): string {
  // e.g. "concours-9eme/9raya/2020/general/sujets+correction/math.pdf" → "math.pdf"
  const parts = key.split('/');
  return parts[parts.length - 1] || 'document.pdf';
}

/**
 * GET /api/concours-file/[...key]
 *
 * Serves Concours 9ème + BAC PDFs from R2 only.
 * Files were bulk-migrated from Vercel Blob to R2 — see docs/VERCEL-MIGRATION-TODO.md.
 * If a file is not in R2, returns 404 (caller must run the migration script).
 *
 * The key is the same key used in the manifest (e.g.
 * "concours-9eme/officials/2026/technique/sujets/math.pdf").
 *
 * Security: only allows paths that exist in the manifest (which is
 * curated during upload — not user-generated). This prevents SSRF.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ key: string[] }> }) {
  const { key: keyParts } = await params;
  const key = keyParts.map(decodeURIComponent).join('/');

  // Look up the file in either the concours or bac manifest
  const concoursFiles = getOriginalConcoursFiles();
  const bacFiles = getOriginalBacFiles();
  const file = concoursFiles.find((f) => f.key === key) || bacFiles.find((f) => f.key === key);

  if (!file) {
    return new NextResponse('Fichier non trouvé', { status: 404 });
  }

  // 1. Try R2 (the new canonical location for all PDFs)
  const { getCloudflareContext } = await import('@opennextjs/cloudflare');
  const ctx = await getCloudflareContext({ async: true });
  const bucket = (ctx as any).env.PDFS_BUCKET as R2Bucket | undefined;

  if (!bucket) {
    return new NextResponse('Storage not configured', { status: 500 });
  }

  try {
    const obj = await bucket.get(key);
    if (obj) {
      const contentType = obj.httpMetadata?.contentType || 'application/pdf';
      const filename = getFilenameFromKey(key);
      const headers = new Headers();
      headers.set('Content-Type', contentType);
      headers.set('Content-Disposition', `inline; filename="${sanitizeFilename(filename)}"; filename*=UTF-8''${encodeURIComponent(filename)}`);
      headers.set('Cache-Control', 'public, max-age=86400, must-revalidate');
      headers.set('X-Content-Type-Options', 'nosniff');
      return new NextResponse(obj.body, { status: 200, headers });
    }
  } catch (e: any) {
    console.error('[api/concours-file] R2 error:', e.message);
  }

  // 2. R2 lookup failed — file not migrated yet
  return new NextResponse(
    'Fichier non disponible (migration R2 en cours). Veuillez réessayer plus tard.',
    { status: 404 }
  );
}
