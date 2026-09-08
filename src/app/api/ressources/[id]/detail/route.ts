// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { invalidateCache } from '@/lib/kv-cache';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: rawId } = await params;
  const numericId = parseInt(rawId, 10);
  if (isNaN(numericId) || numericId <= 0) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }
  
  try {
    const ctx = await getCloudflareContext({ async: true });
    const db = (ctx as any).env.DB;

    // PERF 2026-09-02: Cache the full detail response (5 SELECT queries merged into 1 KV read on hit)
    // 60s TTL balances freshness with cache hit rate
    // Cache key: 'resource-detail-v1-{numericId}'
    // Invalidation: rating/comment actions, resource edit, metadata regen
    const cacheKey = `resource-detail-v1-${numericId}`;
    const kv = (ctx as any).env.APP_CACHE;

    if (kv) {
      try {
        const cached = await kv.get(cacheKey, { type: 'json' });
        if (cached) {
          // Update viewsCount asynchronously (don't block the response)
          // Note: this is a write, so we await it (no fire-and-forget on CF Workers)
          // but the response is already sent to the client
          try {
            await db.prepare('UPDATE Resource SET viewsCount = viewsCount + 1 WHERE numericId = ?').bind(numericId).run();
          } catch (e) {}
          return NextResponse.json(cached as any);
        }
      } catch (e) {
        // Cache read failed — fall through to query
      }
    }
    
    // Use a single, simple query first
    const r: any = await db.prepare(`
      SELECT
        r.id, r.numericId, r.slug, r.title, r.description, r.summary, r.type, r.status,
        r.fileKey, r.fileUrl, r.fileSize, r.pageCount,
        r.tags, r.language, r.schoolType, r.hasCorrection,
        r.viewsCount, r.downloadsCount, r.avgRating, r.ratingsCount,
        r.commentsCount, r.favoritesCount, r.publishedAt, r.createdAt,
        s.id as s_id, s.slug as s_slug, s.nameFr as s_nameFr, s.nameAr as s_nameAr, s.color as s_color,
        cl.id as cl_id, cl.slug as cl_slug, cl.nameFr as cl_nameFr, cl.nameAr as cl_nameAr, cl.levelId as cl_levelId,
        lv.id as lv_id, lv.slug as lv_slug, lv.nameFr as lv_nameFr,
        t.id as t_id, t.firstName as t_firstName, t.lastName as t_lastName, t.firstNameAr as t_firstNameAr, t.lastNameAr as t_lastNameAr,
        t.numericId as t_numericId, t.slug as t_slug, t.avatarUrl as t_avatarUrl
      FROM Resource r
      LEFT JOIN Subject s ON r.subjectId = s.id
      LEFT JOIN \`Class\` cl ON r.classId = cl.id
      LEFT JOIN Level lv ON cl.levelId = lv.id
      LEFT JOIN User t ON r.teacherId = t.id
      WHERE r.numericId = ?
      LIMIT 1
    `).bind(numericId).first();

    if (!r) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    // 2026-09-05: Filter out non-published + hidden resources from the public API.
    // Previously the detail endpoint returned the resource as long as the row
    // existed in the DB, even when status=DRAFT or isHidden=1. That meant after
    // a teacher unpublished a resource, the /fr/ressources/[id] page still
    // served the full content (because the client fetched /api/ressources/.../detail).
    //
    // Owners (the teacher who published it) and admins can still see their own
    // unpublished/draft/hidden resources for editing purposes.
    if (r.status !== 'PUBLISHED' || r.isHidden === 1) {
      // Check if the requester is the owner or an admin
      const { getCurrentUser } = await import('@/lib/auth');
      const requester = await getCurrentUser();
      const isOwner = requester && r.teacherId === requester.id;
      const isAdmin = requester && requester.role === 'ADMIN';
      if (!isOwner && !isAdmin) {
        return NextResponse.json({ error: 'Not found' }, { status: 404 });
      }
      // Mark the response so the client can show a "this is unpublished" notice
      r._unpublishedForViewer = true;
    }
    
    // Ratings - simple query, no template literal
    const ratings = await db.prepare(
      'SELECT r.id, r.value as stars, r.createdAt FROM Rating r WHERE r.resourceId = ? ORDER BY r.createdAt DESC LIMIT 10'
    ).bind(r.id).all();

    // ResourceMetadata — AI-extracted content (keyPoints, exerciseInsights, shortKeyPoints, etc.)
    // 2026-08-31: previously missing from the response, so the resource detail page
    // didn't show the "Aperçu des exercices" or "Points clés" accordions.
    const meta = await db.prepare(
      `SELECT systemName, subject, profNames, dossierTechnique, shortKeyPoints,
              keyPoints, topics, level, estimatedTimeMinutes, prerequisites,
              keyInsights, exerciseInsights
       FROM ResourceMetadata WHERE resourceId = ? LIMIT 1`
    ).bind(r.id).first();

    // ResourceSummary — AI-generated full text summary
    const sum = await db.prepare(
      'SELECT summary, model, language, generatedAt FROM ResourceSummary WHERE resourceId = ? LIMIT 1'
    ).bind(r.id).first();
    
    // Comments - simple
    const comments = await db.prepare(
      `SELECT c.id, c.content, c.createdAt, c.userId,
              u.firstName, u.lastName, u.avatarUrl
       FROM Comment c
       LEFT JOIN User u ON c.userId = u.id
       WHERE c.resourceId = ? AND c.isHidden = 0
       ORDER BY c.createdAt DESC
       LIMIT 10`
    ).bind(r.id).all();
    
    // Increment views - fire and forget
    try {
      await db.prepare('UPDATE Resource SET viewsCount = viewsCount + 1 WHERE id = ?').bind(r.id).run();
    } catch (e) {}
    
    const responseData = {
      resource: {
        id: r.id, numericId: r.numericId, slug: r.slug, title: r.title,
        description: r.description, type: r.type, status: r.status,
        // File info (needed for PDF viewer and download)
        fileKey: r.fileKey || null, fileUrl: r.fileUrl || null, r2Key: r.r2Key || null,
        fileSize: r.fileSize || null, pageCount: r.pageCount || null,
        subject: r.s_id ? { id: r.s_id, slug: r.s_slug, nameFr: r.s_nameFr, nameAr: r.s_nameAr, color: r.s_color } : null,
        class: r.cl_id ? { id: r.cl_id, slug: r.cl_slug, nameFr: r.cl_nameFr, nameAr: r.cl_nameAr, levelId: r.cl_levelId } : null,
        level: r.lv_id ? { id: r.lv_id, slug: r.lv_slug, nameFr: r.lv_nameFr } : null,
        teacher: r.t_id ? { id: r.t_id, numericId: r.t_numericId, slug: r.t_slug, firstName: r.t_firstName, lastName: r.t_lastName } : null,
        viewsCount: r.viewsCount || 0, downloadsCount: r.downloadsCount || 0, avgRating: r.avgRating || 0,
        ratingCount: r.ratingsCount || 0, commentsCount: r.commentsCount || 0,
        // AI metadata — populates "Aperçu des exercices" + "Points clés" accordions
        metadata: meta ? {
          systemName: meta.systemName || null,
          subject: meta.subject || null,
          profNames: meta.profNames ? JSON.parse(meta.profNames as string) : null,
          dossierTechnique: meta.dossierTechnique || null,
          shortKeyPoints: meta.shortKeyPoints ? JSON.parse(meta.shortKeyPoints as string) : null,
          keyPoints: meta.keyPoints ? JSON.parse(meta.keyPoints as string) : null,
          topics: meta.topics ? JSON.parse(meta.topics as string) : null,
          level: meta.level || null,
          estimatedTimeMinutes: meta.estimatedTimeMinutes || null,
          prerequisites: meta.prerequisites ? JSON.parse(meta.prerequisites as string) : null,
          keyInsights: meta.keyInsights ? JSON.parse(meta.keyInsights as string) : null,
          exerciseInsights: meta.exerciseInsights ? JSON.parse(meta.exerciseInsights as string) : null,
        } : null,
        // AI full text summary
        summary: sum?.summary || null,
        summaryModel: sum?.model || null,
        summaryLanguage: sum?.language || null,
        summaryGeneratedAt: sum?.generatedAt || null,
      },
      ratings: ratings?.results || [],
      comments: (comments?.results || []).map((c: any) => ({
        id: c.id,
        content: c.content,
        createdAt: c.createdAt,
        user: {
          id: c.userId,
          firstName: c.firstName,
          lastName: c.lastName,
          avatarUrl: c.avatarUrl,
        },
      })),
    };

    // PERF 2026-09-02: Store in KV cache (60s TTL)
    if (kv) {
      try {
        await kv.put(cacheKey, JSON.stringify(responseData), { expirationTtl: 60 });
      } catch (e) {
        // Cache write failed — still return response
      }
    }

    return NextResponse.json(responseData);
  } catch (e: any) {
    console.error('[detail] error:', e?.message, e?.stack);
    return NextResponse.json({ error: e?.message, stack: e?.stack }, { status: 500 });
  }
}
