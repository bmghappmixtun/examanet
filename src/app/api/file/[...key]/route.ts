// @ts-nocheck
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';

const ALLOWED_PREFIXES = [
  'teacher-library/',
  'concours-9eme/',
  'bac/',
  'resources/',
  'thumbnails/',
  'test-',
  'verification/',
  'text/',  // 2026-09-22: AI Search text bucket
];

/**
 * GET /api/file/[...key]
 *
 * Public unified file proxy for Examanet. R2 only.
 * If a teacher-library .doc/.docx is marked as orphan (lost in 2026-09-22 R2 cleanup),
 * returns 410 Gone with a user-friendly message in FR/AR.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ key: string[] }> },
) {
  const { key: keyParts } = await params;
  const key = keyParts.map(decodeURIComponent).join('/');

  // Path-traversal guard
  if (!key || key.includes('..') || key.startsWith('/')) {
    return new NextResponse('Bad request', { status: 400 });
  }

  // Allow-list
  if (!ALLOWED_PREFIXES.some((p) => key.startsWith(p))) {
    return new NextResponse('Not found', { status: 404 });
  }

  // 2026-09-22: Check if this teacher-library .doc/.docx is a known orphan
  if (key.startsWith('teacher-library/')) {
    const lower = key.toLowerCase();
    if (lower.endsWith('.doc') || lower.endsWith('.docx')) {
      const orphan = await checkOrphanStatus(key);
      if (orphan) {
        return buildGoneResponse(req, orphan);
      }
    }
  }

  // Try R2 — pick the right bucket based on prefix
  // 2026-09-22: text/ lives in TEXT_BUCKET
  const { getCloudflareContext } = await import('@opennextjs/cloudflare');
  const ctx = await getCloudflareContext({ async: true });
  const env = (ctx as any).env;
  const bucket = key.startsWith('text/')
    ? (env?.TEXT_BUCKET as R2Bucket | undefined)
    : (env?.PDFS_BUCKET as R2Bucket | undefined);

  if (!bucket) {
    return new NextResponse('Storage not configured', { status: 500 });
  }

  try {
    const obj = await bucket.get(key);
    if (!obj) {
      return new NextResponse('Not found in R2', { status: 404 });
    }

    const headers = new Headers();
    headers.set(
      'Content-Type',
      obj.httpMetadata?.contentType || 'application/pdf',
    );
    headers.set('Cache-Control', 'public, max-age=3600, s-maxage=86400');
    const fileName = key.split('/').pop() || 'file.pdf';
    headers.set(
      'Content-Disposition',
      `inline; filename="${encodeURIComponent(fileName)}"`,
    );
    return new NextResponse(obj.body, { status: 200, headers });
  } catch (e: any) {
    console.error('[api/file] R2 error:', e.message);
    return new NextResponse(`R2 error: ${e.message}`, { status: 502 });
  }
}

/**
 * Look up if a teacher-library file is marked as orphan in D1.
 * Returns the orphan record if found, null otherwise.
 */
async function checkOrphanStatus(key: string): Promise<any | null> {
  try {
    const { getCloudflareContext } = await import('@opennextjs/cloudflare');
    const ctx = await getCloudflareContext({ async: true });
    const db = (ctx as any).env?.DB;
    if (!db) return null;

    const fileUrl = `/api/file/${key}`;
    const stmt = db.prepare(
      'SELECT id, fileName, originalLostAt, originalLostReason FROM TeacherFile WHERE fileUrl = ? AND isOriginalLost = 1 LIMIT 1'
    ).bind(fileUrl);
    return (await stmt.first()) || null;
  } catch (e) {
    console.error('[api/file/orphan] check failed:', (e as any).message);
    return null;
  }
}

/**
 * Build a 410 Gone response with localized message.
 */
function buildGoneResponse(req: NextRequest, orphan: any): NextResponse {
  const acceptLang = req.headers.get('accept-language') || '';
  const isAr = acceptLang.toLowerCase().startsWith('ar');

  const frMsg = [
    'Document original perdu le 22/09/2026 lors d\'un incident de maintenance R2.',
    '',
    'La version PDF convertie peut être disponible dans la bibliothèque du professeur.',
    'Pour récupérer ce document, contactez l\'administrateur (admin@examanet.com).',
  ].join('\n');

  const arMsg = [
    'فُقد المستند الأصلي في 22/09/2026 أثناء حادث صيانة على R2.',
    '',
    'قد تكون نسخة PDF المحوّلة متاحة في مكتبة الأستاذ.',
    'لاسترجاع هذا المستند، يُرجى التواصل مع المشرف (admin@examanet.com).',
  ].join('\n');

  const body = isAr ? arMsg : frMsg;

  const headers = new Headers();
  headers.set('Content-Type', 'text/plain; charset=utf-8');
  headers.set('Content-Language', isAr ? 'ar' : 'fr');
  headers.set('X-Document-Status', 'original-lost');
  headers.set('X-Lost-At', String(orphan.originalLostAt || ''));
  headers.set('Cache-Control', 'no-store');

  return new NextResponse(body, { status: 410, headers });
}
