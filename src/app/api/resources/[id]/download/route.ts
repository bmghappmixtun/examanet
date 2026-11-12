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
 * 2026-11-12 — LECTURE DIRECTE DANS R2 (correction du 502 sur 100 % des
 * téléchargements).
 *
 * Après la migration Vercel Blob → R2, `Resource.fileUrl` contient un CHEMIN
 * RELATIF (`/api/file/teacher-library/<teacherId>/imported/xxx.pdf`) :
 * les 15 421 ressources PUBLISHED n'ont AUCUNE URL absolue (vérifié en D1).
 *
 * L'ancien code faisait `fetch(sourceUrl)` → `fetch('/api/file/...')` →
 * « Invalid URL » → catch → 502. Le bouton bleu « Télécharger PDF » de
 * TOUTES les ressources était donc cassé (le PDF, lui, est bien dans R2 :
 * `GET /api/file/<clé>` renvoie 200 + le vrai PDF).
 *
 * Correctif : on lit l'objet R2 directement (bucket PDFS_BUCKET, ou
 * TEXT_BUCKET pour le préfixe `text/` — même règle que /api/file/[...key]).
 * Si l'objet est introuvable, on bascule sur le proxy HTTP (qui sait
 * notamment renvoyer 410 pour un document orphelin).
 */
async function streamFromR2(
  key: string,
  filename: string,
  contentType: string,
): Promise<NextResponse | null> {
  if (!key) return null;

  const ctx = await getCloudflareContext({ async: true });
  const env = (ctx as any).env;
  const bucket = key.startsWith('text/')
    ? env?.TEXT_BUCKET
    : env?.PDFS_BUCKET;
  if (!bucket) return null;

  const obj = await bucket.get(key);
  if (!obj) return null;

  const safeName = sanitizeFilename(filename);
  return new NextResponse(obj.body, {
    status: 200,
    headers: {
      'Content-Type': obj.httpMetadata?.contentType || contentType,
      'Content-Disposition': `attachment; filename="${safeName}"; filename*=UTF-8''${encodeURIComponent(safeName)}`,
      'Cache-Control': 'public, max-age=3600, must-revalidate',
      'X-Content-Type-Options': 'nosniff',
      'X-Robots-Tag': 'noindex, nofollow',
      'X-Storage-Backend': 'r2',
    },
  });
}

/**
 * Clés R2 candidates pour une ressource, par ordre de priorité.
 * `Resource.fileKey` est déjà la clé R2 exacte ; à défaut on la déduit de
 * `fileUrl` (`/api/file/<clé>`).
 */
function r2KeyCandidates(resource: { fileKey?: string | null; r2Key?: string | null; fileUrl?: string | null }): string[] {
  const keys: string[] = [];
  const push = (k?: string | null) => {
    if (k && !keys.includes(k)) keys.push(k);
  };
  push(resource.r2Key);
  push(resource.fileKey);
  const url = resource.fileUrl;
  if (url && url.startsWith('/api/file/')) {
    push(url.slice('/api/file/'.length));
  }
  return keys;
}

/**
 * 2026-11-12 — Le fichier n'existe plus dans le stockage R2 (document
 * orphelin : incident de maintenance R2 du 22/09/2026). ~4 % des ressources
 * sont dans ce cas. On renvoie une page explicative FR/AR plutôt qu'un
 * brut technique : le bouton « Télécharger » ouvre cette page dans un
 * onglet, l'utilisateur doit comprendre ce qu'il se passe.
 */
function buildMissingFileResponse(lang: 'fr' | 'ar', filename: string): NextResponse {
  const isAr = lang === 'ar';
  const title = isAr ? 'الوثيقة غير متوفرة' : 'Document indisponible';
  const lines = isAr
    ? [
        'هذه الوثيقة لم تعد متوفرة في مخزن الملفات.',
        '',
        'ربما تكون قد فُقدت أثناء عملية صيانة على مساحة التخزين (22/09/2026).',
        'للمساعدة، يُرجى التواصل مع المشرف (admin@examanet.com).',
      ]
    : [
        "Ce document n'est plus disponible dans le stockage.",
        '',
        "Il a probablement été perdu lors d'une opération de maintenance du stockage (22/09/2026).",
        "Pour aide, contactez l'administrateur (admin@examanet.com).",
      ];

  const html = `<!doctype html>
<html lang="${isAr ? 'ar' : 'fr'}" dir="${isAr ? 'rtl' : 'ltr'}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${title}</title>
<style>
  body{font-family:system-ui,-apple-system,"Segoe UI",sans-serif;background:#f8fafc;color:#0f172a;
       display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0;padding:24px}
  .card{background:#fff;border:1px solid #e2e8f0;border-radius:16px;padding:32px;max-width:560px;
        box-shadow:0 10px 30px rgba(15,23,42,.08)}
  h1{font-size:1.25rem;margin:0 0 12px}
  p{line-height:1.7;margin:0 0 8px;color:#334155}
  .file{font-size:.85rem;color:#64748b;word-break:break-all;margin-top:16px}
  a{color:#0f766e}
</style>
</head>
<body>
  <main class="card">
    <h1>${title}</h1>
    ${lines.map((l) => (l ? `<p>${l}</p>` : '<p>&nbsp;</p>')).join('\n    ')}
    <p class="file">${filename}</p>
    <p><a href="/">${isAr ? 'العودة إلى الصفحة الرئيسية' : 'Retour à l\'accueil'}</a></p>
  </main>
</body>
</html>`;

  const headers = new Headers();
  headers.set('Content-Type', 'text/html; charset=utf-8');
  headers.set('Content-Language', isAr ? 'ar' : 'fr');
  headers.set('Cache-Control', 'no-store');
  headers.set('X-Document-Status', 'missing-in-storage');
  headers.set('X-Robots-Tag', 'noindex, nofollow');

  return new NextResponse(html, { status: 404, headers });
}

/**
 * Stream a file to the client.
 * Sets Content-Disposition so the browser downloads with the right filename.
 */
async function streamFileToClient(
  sourceUrl: string,
  filename: string,
  contentType = 'application/pdf',
  baseUrl?: string,
  r2Keys: string[] = [],
  lang: 'fr' | 'ar' = 'fr',
): Promise<NextResponse> {
  const safeName = sanitizeFilename(filename);

  // 1) Lecture directe dans R2 (le cas de 100 % des ressources actuelles).
  for (const key of r2Keys) {
    try {
      const fromR2 = await streamFromR2(key, filename, contentType);
      if (fromR2) return fromR2;
    } catch (e: any) {
      console.error('[download] lecture R2 impossible pour', key, e?.message);
    }
  }

  try {
    // 2) Repli proxy HTTP : fetch() exige une URL ABSOLUE, on résout donc
    //    les chemins relatifs contre l'origine de la requête.
    const absoluteUrl = sourceUrl.startsWith('/')
      ? new URL(sourceUrl, baseUrl || 'https://examanet.com').toString()
      : sourceUrl;

    const upstream = await fetch(absoluteUrl, {
      headers: { 'User-Agent': 'Examanet-Proxy/1.0' },
    });

    if (!upstream.ok) {
      // 404 = le document n'existe plus dans le stockage (page explicative),
      // le reste = erreur amont.
      if (upstream.status === 404) {
        return buildMissingFileResponse(lang, safeName);
      }
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
        'X-Robots-Tag': 'noindex, nofollow',
        'X-Storage-Backend': 'r2',
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
      return NextResponse.json({ error: 'Aucun fichier associé' }, { status: 404 });
    }

    // Track the view/download
    await incrementViewsAndDownloads(db, resource.id, req);

    const lang = (req.headers.get('accept-language') || '').toLowerCase().startsWith('ar') ? 'ar' : 'fr';

    return streamFileToClient(
      resource.fileUrl,
      buildFilename(resource, false),
      'application/pdf',
      req.nextUrl?.origin,
      r2KeyCandidates(resource),
      lang,
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
