// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';

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
    
    // Ratings - simple query, no template literal
    const ratings = await db.prepare(
      'SELECT r.id, r.value as stars, r.createdAt FROM Rating r WHERE r.resourceId = ? ORDER BY r.createdAt DESC LIMIT 10'
    ).bind(r.id).all();
    
    // Comments - simple
    const comments = await db.prepare(
      'SELECT c.id, c.content, c.createdAt FROM Comment c WHERE c.resourceId = ? AND c.isHidden = 0 ORDER BY c.createdAt DESC LIMIT 10'
    ).bind(r.id).all();
    
    // Increment views - fire and forget
    try {
      await db.prepare('UPDATE Resource SET viewsCount = viewsCount + 1 WHERE id = ?').bind(r.id).run();
    } catch (e) {}
    
    return NextResponse.json({
      resource: {
        id: r.id, numericId: r.numericId, slug: r.slug, title: r.title,
        description: r.description, type: r.type, status: r.status,
        subject: r.s_id ? { id: r.s_id, slug: r.s_slug, nameFr: r.s_nameFr, nameAr: r.s_nameAr, color: r.s_color } : null,
        class: r.cl_id ? { id: r.cl_id, slug: r.cl_slug, nameFr: r.cl_nameFr, nameAr: r.cl_nameAr, levelId: r.cl_levelId } : null,
        level: r.lv_id ? { id: r.lv_id, slug: r.lv_slug, nameFr: r.lv_nameFr } : null,
        teacher: r.t_id ? { id: r.t_id, numericId: r.t_numericId, slug: r.t_slug, firstName: r.t_firstName, lastName: r.t_lastName } : null,
        viewsCount: r.viewsCount || 0, downloadsCount: r.downloadsCount || 0, avgRating: r.avgRating || 0,
        ratingCount: r.ratingsCount || 0, commentsCount: r.commentsCount || 0,
      },
      ratings: ratings?.results || [],
      comments: comments?.results || [],
    });
  } catch (e: any) {
    console.error('[detail] error:', e?.message, e?.stack);
    return NextResponse.json({ error: e?.message, stack: e?.stack }, { status: 500 });
  }
}
