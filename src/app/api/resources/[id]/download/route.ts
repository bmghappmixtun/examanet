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
 * Stream a file from R2 (or fallback to URL) to the client.
 * Sets Content-Disposition so the browser downloads with the right filename.
 *
 * 2026-09-04: Rewritten to stream directly from R2 using fileKey/r2Key
 * (was: fetch the relative fileUrl which fails because fetch needs an absolute URL).
 * Falls back to fetching fileUrl only if the R2 lookup fails.
 */
async function streamFileToClient(
  sourceUrl: string,
  filename: string,
  r2Key: string | null | undefined,
  fileKey: string | null | undefined,
  contentType = 'application/pdf',
): Promise<NextResponse> {
  const safeName = sanitizeFilename(filename);

  // Primary path: stream from R2. Prefer r2Key, fall back to fileKey (which IS the R2 key
  // for resources uploaded before the r2Key field was added in 2026-08-27).
  const r2LookupKey = r2Key || fileKey;
  if (r2LookupKey) {
    try {
      const { getCloudflareContext } = await import('@opennextjs/cloudflare');
      const ctx = await getCloudflareContext({ async: true });
      const bucket = (ctx as any).env?.PDFS_BUCKET as R2Bucket | undefined;
      if (bucket) {
        const obj = await bucket.get(r2LookupKey);
        if (obj) {
          return new Response(obj.body, {
            status: 200,
            headers: {
              'Content-Type': obj.httpMetadata?.contentType || contentType,
              'Content-Disposition': `attachment; filename="${safeName}"; filename*=UTF-8''${encodeURIComponent(safeName)}`,
              'Cache-Control': 'public, max-age=3600, must-revalidate',
              'X-Content-Type-Options': 'nosniff',
              'X-Storage-Backend': 'r2',
            },
          });
        }
      }
    } catch (e: any) {
      console.warn('[download] R2 stream failed, falling back to URL:', e?.message);
    }
  }

  // Fallback: fetch from sourceUrl (only works if it's an absolute URL)
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
        'X-Storage-Backend': 'r2-fallback',
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
    SELECT id, numericId, slug, title, type, status, isHidden, fileKey, fileUrl, r2Key,
           fileSize
    FROM Resource
    WHERE numericId = ?
    LIMIT 1
  `).bind(numericId).first();
}

async function incrementViewsAndDownloads(db: any, resourceId: string) {
  // Update views count (fire and forget)
  db.prepare('UPDATE Resource SET viewsCount = viewsCount + 1 WHERE id = ?')
    .bind(resourceId)
    .run()
    .catch(() => {});
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

    // 2026-09-05: Hide resources that are not PUBLISHED or that are admin/teacher-hidden.
    // The teacher can "unpublish" their own resource from /enseignant/ressources
    // (sets status=DRAFT + isHidden=1), but the download endpoint was still serving
    // the file because the check only looked at status. Now we also require isHidden=0.
    if (resource.status !== 'PUBLISHED' || (resource as any).isHidden === 1) {
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
    await incrementViewsAndDownloads(db, resource.id);

    return streamFileToClient(
      resource.fileUrl,
      buildFilename(resource, false),
      resource.r2Key, // 2026-09-04: stream from R2 directly (fixes 502)
      resource.fileKey, // fallback for legacy resources
      'application/pdf',
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
