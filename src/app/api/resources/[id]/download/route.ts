// @ts-nocheck
// 2026-08-27: D1-based download endpoint (replaces prisma-based).
// The prisma-compat proxy on CF Workers was failing intermittently
// (race condition with getCloudflareContext), causing downloads to fail
// ~50% of the time. Using D1 directly is 100% reliable.

import { NextRequest, NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';

export const dynamic = 'force-dynamic';

function sanitizeFilename(name: string): string {
  return name
    .replace(/[\x00-\x1F\x7F]/g, '')
    .replace(/[<>:"/\\|?*]/g, '_')
    .substring(0, 200);
}

function buildFilename(
  resource: { title: string; originalFileName?: string | null },
  original: boolean,
): string {
  if (original && resource.originalFileName) {
    return resource.originalFileName;
  }
  const cleanTitle = resource.title
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/[^a-zA-Z0-9À-ÿ\s\-_()]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .substring(0, 150);
  return `${cleanTitle || 'document'}.pdf`;
}

/**
 * Stream a file from a URL (Vercel Blob) to the client.
 * Sets Content-Disposition so the browser downloads with the right filename.
 */
async function streamFileToClient(
  sourceUrl: string,
  filename: string,
  contentType = 'application/pdf',
): Promise<NextResponse> {
  const safeName = sanitizeFilename(filename);
  
  try {
    const upstream = await fetch(sourceUrl, {
      headers: { 'User-Agent': 'Examanet-Proxy/1.0' },
    });
    
    if (!upstream.ok) {
      return new NextResponse(
        `Upstream fetch failed: ${upstream.status} for ${sourceUrl}`,
        { status: 502 }
      );
    }
    
    return new NextResponse(upstream.body, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${safeName}"; filename*=UTF-8''${encodeURIComponent(safeName)}`,
        'Cache-Control': 'public, max-age=3600, must-revalidate',
        'X-Content-Type-Options': 'nosniff',
        'X-Storage-Backend': 'vercel-blob',
      },
    });
  } catch (e: any) {
    return new NextResponse(
      `Stream error: ${e?.message || 'unknown'}`,
      { status: 502 }
    );
  }
}

async function getResourceByNumericId(db: any, numericId: number) {
  return await db.prepare(`
    SELECT id, numericId, slug, title, type, status, fileKey, fileUrl, r2Key,
           fileSize
    FROM Resource
    WHERE numericId = ?
    LIMIT 1
  `).bind(numericId).first();
}

async function incrementViewsAndDownloads(db: any, resourceId: string, request: NextRequest) {
  // Update views/downloads counters (fire and forget)
  db.prepare('UPDATE Resource SET viewsCount = viewsCount + 1 WHERE id = ?')
    .bind(resourceId)
    .run()
    .catch(() => {});
  db.prepare('UPDATE Resource SET downloadsCount = downloadsCount + 1 WHERE id = ?')
    .bind(resourceId)
    .run()
    .catch(() => {});

  // 2026-09-14: Record the download per-user in the Download table for student analytics.
  // Without this, /admin/utilisateurs student stats show 0 for downloads.
  // Anonymous downloads still increment the counter but don't create a userId row.
  try {
    const { getCurrentUser } = await import('@/lib/auth');
    const currentUser = await getCurrentUser();
    const ipAddress = request.headers.get('cf-connecting-ip') || request.headers.get('x-forwarded-for') || null;
    const userAgent = request.headers.get('user-agent') || null;
    await db.prepare(
      'INSERT INTO Download (id, resourceId, userId, ipAddress, userAgent, original, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).bind(
      crypto.randomUUID(),
      resourceId,
      currentUser?.id || null,
      ipAddress,
      userAgent?.slice(0, 500) || null,
      false,
      Date.now()
    ).run();
  } catch (e) {
    // Don't fail the request if download tracking fails
  }
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const reqStart = Date.now();
  try {
    const ctx = await getCloudflareContext({ async: true });
    const db = (ctx as any).env.DB;
    
    const { id: rawId } = await params;
    const numericId = parseInt(rawId, 10);
    if (isNaN(numericId) || numericId <= 0) {
      return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
    }
    
    const resource = await getResourceByNumericId(db, numericId);
    if (!resource) {
      return NextResponse.json({ error: 'Non trouvé' }, { status: 404 });
    }
    
    if (resource.status !== 'PUBLISHED' && resource.status !== 'ARCHIVED') {
      return NextResponse.json({ error: 'Non disponible' }, { status: 403 });
    }
    
    const wantsOriginal = req.nextUrl.searchParams.get('original') === '1';
    
    // Original Office file (not implemented in D1 yet)
    if (wantsOriginal) {
      return NextResponse.json(
        { error: 'Téléchargement original non supporté sur cette instance' },
        { status: 501 }
      );
    }
    
    // Default: stream the PDF
    if (!resource.fileUrl) {
      return NextResponse.json(
        { error: 'Aucun fichier associé' },
        { status: 404 }
      );
    }
    
    // Track the view/download
    await incrementViewsAndDownloads(db, resource.id, req);
    
    return streamFileToClient(
      resource.fileUrl,
      buildFilename(resource, false),
      'application/pdf'
    );
  } catch (e: any) {
    const elapsed = Date.now() - reqStart;
    console.error('[download FAILED]', {
      elapsed,
      error: e?.message || String(e),
      stack: e?.stack?.split('\n').slice(0, 3).join(' | '),
    });
    return new NextResponse(
      JSON.stringify({
        error: 'Download failed',
        message: e?.message || String(e),
        elapsed,
      }),
      { status: 500, headers: { 'content-type': 'application/json' } }
    );
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  // POST is used by the client component to get the download URL
  // (e.g., for tracking) - simpler implementation: just redirect to GET
  
  const { id: rawId } = await params;
  const numericId = parseInt(rawId, 10);
  if (isNaN(numericId) || numericId <= 0) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }
  
  try {
    const ctx = await getCloudflareContext({ async: true });
    const db = (ctx as any).env.DB;
    
    const resource = await getResourceByNumericId(db, numericId);
    if (!resource) {
      return NextResponse.json({ error: 'Non trouvé' }, { status: 404 });
    }
    
    return NextResponse.json({
      url: `/api/resources/${numericId}/download`,
      fileName: buildFilename(resource, false),
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'unknown' }, { status: 500 });
  }
}
