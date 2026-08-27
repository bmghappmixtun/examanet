// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';

/**
 * GET /api/ressources/[id]/detail?numericId=X
 *
 * Returns ALL data needed for the resource detail page.
 * Uses D1 directly (not prisma-compat) to avoid 1101 errors on CF Workers.
 *
 * NOTE: SQL strings use string concatenation (not template literals)
 * to avoid backtick parsing issues with reserved words like `Class`.
 */
export const dynamic = 'force-dynamic';

const TABLE_C = '"Class"'; // SQLite accepts double quotes for reserved words

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: rawId } = await params;
  const sp = request.nextUrl.searchParams;
  const numericId = parseInt(rawId, 10);
  if (isNaN(numericId) || numericId <= 0) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }
  const userId = sp.get('userId') || null;
  const userRole = sp.get('userRole') || null;
  
  try {
    const ctx = await getCloudflareContext({ async: true });
    const db = (ctx as any).env.DB;
    
    // Build SQL via string concatenation to avoid backtick issues
    const mainSql = [
      'SELECT',
      '  r.id, r.numericId, r.slug, r.title, r.description, r.summary, r.type, r.status,',
      '  r.fileKey, r.fileUrl, r.fileSize, r.pageCount, r.thumbnailKey, r.thumbnailUrl, r.r2Key,',
      '  r.tags, r.language, r.headerData, r.schoolName, r.teacherNameAr,',
      '  r.homeworkSubtype, r.homeworkNumber, r.schoolType, r.hasCorrection,',
      '  r.isFeatured, r.viewsCount, r.downloadsCount, r.avgRating, r.ratingsCount,',
      '  r.commentsCount, r.favoritesCount, r.publishedAt, r.createdAt, r.updatedAt,',
      '  s.id as s_id, s.slug as s_slug, s.nameFr as s_nameFr, s.nameAr as s_nameAr, s.color as s_color,',
      '  cl.id as cl_id, cl.slug as cl_slug, cl.nameFr as cl_nameFr, cl.nameAr as cl_nameAr, cl.levelId as cl_levelId, cl.numericId as cl_numericId,',
      '  lv.id as lv_id, lv.slug as lv_slug, lv.nameFr as lv_nameFr, lv.nameAr as lv_nameAr,',
      '  sec.id as sec_id, sec.slug as sec_slug, sec.nameFr as sec_nameFr, sec.nameAr as sec_nameAr,',
      '  t.id as t_id, t.firstName as t_firstName, t.lastName as t_lastName, t.firstNameAr as t_firstNameAr, t.lastNameAr as t_lastNameAr,',
      '  t.numericId as t_numericId, t.slug as t_slug, t.avatarUrl as t_avatarUrl, t.schoolName as t_schoolName, t.schoolNameAr as t_schoolNameAr,',
      '  m.systemName as m_systemName, m.subject as m_subject, m.profNames as m_profNames, m.dossierTechnique as m_dossierTechnique,',
      '  m.shortKeyPoints as m_shortKeyPoints, m.keyPoints as m_keyPoints, m.topics as m_topics, m.level as m_level,',
      '  m.estimatedTimeMinutes as m_estimatedTimeMinutes, m.prerequisites as m_prerequisites, m.keyInsights as m_keyInsights,',
      '  m.exerciseInsights as m_exerciseInsights,',
      '  ct.text as ct_text, ct.pages as ct_pages,',
      '  sm.summary as sm_summary, sm.language as sm_language',
      'FROM Resource r',
      'LEFT JOIN Subject s ON r.subjectId = s.id',
      'LEFT JOIN ' + TABLE_C + ' cl ON r.classId = cl.id',
      'LEFT JOIN Level lv ON cl.levelId = lv.id',
      'LEFT JOIN Section sec ON r.sectionId = sec.id',
      'LEFT JOIN User t ON r.teacherId = t.id',
      'LEFT JOIN ResourceMetadata m ON r.id = m.resourceId',
      'LEFT JOIN ResourceContent ct ON r.id = ct.resourceId',
      'LEFT JOIN ResourceSummary sm ON r.id = sm.resourceId',
      'WHERE r.numericId = ?',
      'LIMIT 1'
    ].join('\n');
    
    console.log("[detail] main query start, numericId=", numericId); const r = await db.prepare(mainSql).bind(numericId).first(); console.log("[detail] main query done, r.id=", r?.id, "subjectId=", r?.subjectId);
    
    if (!r) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    
    const status = r.status;
    const teacherId = r.teacherId;
    const isOwner = userId && teacherId === userId;
    const isAdmin = userRole === 'ADMIN';
    if (status !== 'PUBLISHED' && status !== 'ARCHIVED' && !isOwner && !isAdmin) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    
    const ratingsSql = [
      'SELECT r.id, r.value as stars, r.createdAt, u.firstName, u.lastName',
      'FROM Rating r',
      'LEFT JOIN User u ON r.userId = u.id',
      'WHERE r.resourceId = ?',
      'ORDER BY r.createdAt DESC',
      'LIMIT 100'
    ].join('\n');
    console.log("[detail] ratings query start"); const ratingsResult = await db.prepare(ratingsSql).bind(r.id).all(); console.log("[detail] ratings query done, count=", ratingsResult?.results?.length);
    
    const commentsSql = [
      'SELECT c.id, c.content, c.createdAt, c.isHidden,',
      '       u.id as user_id, u.firstName, u.lastName, u.avatarUrl',
      'FROM Comment c',
      'LEFT JOIN User u ON c.userId = u.id',
      'WHERE c.resourceId = ? AND c.isHidden = 0',
      'ORDER BY c.createdAt DESC',
      'LIMIT 50'
    ].join('\n');
    console.log("[detail] comments query start"); const commentsResult = await db.prepare(commentsSql).bind(r.id).all(); console.log("[detail] comments query done, count=", commentsResult?.results?.length);
    
    const similarSql = [
      'SELECT r.id, r.numericId, r.slug, r.title, r.viewsCount, r.downloadsCount, r.avgRating, r.commentsCount,',
      '       s.nameFr as subjectName, s.color as subjectColor,',
      '       cl.nameFr as className, cl.slug as classSlug',
      'FROM Resource r',
      'LEFT JOIN Subject s ON r.subjectId = s.id',
      'LEFT JOIN ' + TABLE_C + ' cl ON r.classId = cl.id',
      'WHERE r.subjectId = ? AND r.id != ? AND r.status = \'PUBLISHED\'',
      'ORDER BY r.viewsCount DESC',
      'LIMIT 4'
    ].join('\n');
    console.log("[detail] similar query start, subjectId=", r.subjectId, "id=", r.id); const similarResult = await db.prepare(similarSql).bind(r.subjectId, r.id).all(); console.log("[detail] similar query done, count=", similarResult?.results?.length);
    
    try {
      await db.prepare('UPDATE Resource SET viewsCount = viewsCount + 1 WHERE id = ?').bind(r.id).run();
    } catch (e) {}
    
    const resource = {
      id: r.id,
      numericId: r.numericId,
      slug: r.slug,
      title: r.title,
      description: r.description,
      summary: r.summary,
      type: r.type,
      status: r.status,
      fileKey: r.fileKey,
      fileUrl: `/api/resources/${r.numericId}/download`,
      fileSize: r.fileSize,
      pageCount: r.pageCount,
      thumbnailKey: r.thumbnailKey,
      thumbnailUrl: r.thumbnailUrl,
      r2Key: r.r2Key,
      tags: r.tags,
      language: r.language,
      headerData: r.headerData,
      schoolName: r.schoolName,
      teacherNameAr: r.teacherNameAr,
      homeworkSubtype: r.homeworkSubtype,
      homeworkNumber: r.homeworkNumber,
      schoolType: r.schoolType,
      hasCorrection: !!r.hasCorrection,
      isFeatured: !!r.isFeatured,
      viewsCount: r.viewsCount || 0,
      downloadsCount: r.downloadsCount || 0,
      avgRating: r.avgRating || 0,
      ratingCount: r.ratingsCount || 0,
      commentsCount: r.commentsCount || 0,
      favoritesCount: r.favoritesCount || 0,
      publishedAt: r.publishedAt,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      correctionSummary: null,
      product: null,
      subject: r.s_id ? { id: r.s_id, slug: r.s_slug, nameFr: r.s_nameFr, nameAr: r.s_nameAr, color: r.s_color } : null,
      class: r.cl_id ? {
        id: r.cl_id, slug: r.cl_slug, nameFr: r.cl_nameFr, nameAr: r.cl_nameAr,
        levelId: r.cl_levelId, numericId: r.cl_numericId,
        level: r.lv_id ? { id: r.lv_id, slug: r.lv_slug, nameFr: r.lv_nameFr, nameAr: r.lv_nameAr } : null,
      } : null,
      section: r.sec_id ? { id: r.sec_id, slug: r.sec_slug, nameFr: r.sec_nameFr, nameAr: r.sec_nameAr } : null,
      teacher: r.t_id ? {
        id: r.t_id, numericId: r.t_numericId, slug: r.t_slug,
        firstName: r.t_firstName, lastName: r.t_lastName,
        firstNameAr: r.t_firstNameAr, lastNameAr: r.t_lastNameAr,
        avatarUrl: r.t_avatarUrl, schoolName: r.t_schoolName, schoolNameAr: r.t_schoolNameAr,
      } : null,
      metadata: r.m_systemName || r.m_keyInsights || r.m_exerciseInsights ? {
        systemName: r.m_systemName, subject: r.m_subject, profNames: r.m_profNames,
        dossierTechnique: r.m_dossierTechnique, shortKeyPoints: r.m_shortKeyPoints,
        keyPoints: r.m_keyPoints, topics: r.m_topics, level: r.m_level,
        estimatedTimeMinutes: r.m_estimatedTimeMinutes, prerequisites: r.m_prerequisites,
        keyInsights: r.m_keyInsights, exerciseInsights: r.m_exerciseInsights,
      } : null,
      content: r.ct_text ? { text: r.ct_text, pages: r.ct_pages } : null,
      aiSummary: r.sm_summary ? { summary: r.sm_summary, language: r.sm_language } : null,
    };
    
    const ratings = (ratingsResult.results || []).map((rr: any) => ({
      id: rr.id, stars: rr.stars, createdAt: rr.createdAt,
      user: { firstName: rr.firstName, lastName: rr.lastName },
    }));
    
    const aggregateRating = ratings.length > 0 ? {
      ratingCount: ratings.length,
      ratingValue: Math.round((ratings.reduce((s: number, rr: any) => s + rr.stars, 0) / ratings.length) * 10) / 10,
    } : null;
    
    const comments = (commentsResult.results || []).map((c: any) => ({
      id: c.id, content: c.content, createdAt: c.createdAt,
      user: { firstName: c.firstName, lastName: c.lastName, avatarUrl: c.avatarUrl },
    }));
    
    const similar = (similarResult.results || []).map((s: any) => ({
      id: s.id, numericId: s.numericId, slug: s.slug, title: s.title,
      viewsCount: s.viewsCount || 0, downloadsCount: s.downloadsCount || 0,
      avgRating: s.avgRating || 0, commentsCount: s.commentsCount || 0,
      subject: s.subjectName ? { nameFr: s.subjectName, color: s.subjectColor } : null,
      class: s.className ? { nameFr: s.className, slug: s.classSlug } : null,
    }));
    
    return NextResponse.json({ resource, aggregateRating, ratings, comments, similar });
  } catch (e: any) {
    console.error('[api/ressources/[id]/detail] Error:', e?.message, e?.stack);
    return NextResponse.json({ error: e?.message || 'Unknown error' }, { status: 500 });
  }
}
