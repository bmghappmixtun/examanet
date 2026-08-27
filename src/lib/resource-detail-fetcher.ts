// @ts-nocheck
/**
 * Resource detail fetcher.
 *
 * Wraps D1 queries for the resource detail page. Replaces the prisma-compat
 * SSR data fetch which throws 1101 errors on CF Workers.
 *
 * Strategy: small isolated queries (no complex JOINs), each with its own
 * try/catch so one failure doesn't take down the whole page.
 */

import { getCloudflareContext } from '@opennextjs/cloudflare';
import { getCurrentUser } from './auth';

export interface ResourceDetailData {
  resource: any;
  ratings: any[];
  comments: any[];
  similar: any[];
  aggregateRating: { ratingCount: number; ratingValue: number } | null;
  userSession: { id: string; role: string } | null;
}

export async function fetchResourceDetail(numericId: number): Promise<ResourceDetailData | null> {
  try {
    const ctx = await getCloudflareContext({ async: true });
    const db = (ctx as any).env.DB;
    
    // getCurrentUser is unstable on CF Workers; wrap in try/catch
    let userSession: any = null;
    try {
      userSession = await getCurrentUser();
    } catch (e) {
      // Ignore - anonymous user
    }
    
    // Main resource query - simple, only essential JOINs
    const r: any = await db.prepare(`
      SELECT
        r.id, r.numericId, r.slug, r.title, r.description, r.summary, r.type, r.status,
        r.fileKey, r.fileUrl, r.fileSize, r.pageCount, r.thumbnailKey, r.thumbnailUrl, r.r2Key,
        r.tags, r.language, r.headerData, r.schoolName, r.teacherNameAr,
        r.homeworkSubtype, r.homeworkNumber, r.schoolType, r.hasCorrection, r.isFeatured,
        r.year, r.trimester,
        r.viewsCount, r.downloadsCount, r.avgRating, r.ratingsCount,
        r.commentsCount, r.favoritesCount, r.publishedAt, r.createdAt, r.updatedAt,
        r.subjectId, r.classId, r.sectionId, r.teacherId,
        s.id as s_id, s.slug as s_slug, s.nameFr as s_nameFr, s.nameAr as s_nameAr, s.color as s_color,
        cl.id as cl_id, cl.slug as cl_slug, cl.nameFr as cl_nameFr, cl.nameAr as cl_nameAr, cl.levelId as cl_levelId, cl.numericId as cl_numericId,
        lv.id as lv_id, lv.slug as lv_slug, lv.nameFr as lv_nameFr, lv.nameAr as lv_nameAr,
        sec.id as sec_id, sec.slug as sec_slug, sec.nameFr as sec_nameFr, sec.nameAr as sec_nameAr,
        t.id as t_id, t.firstName as t_firstName, t.lastName as t_lastName, t.firstNameAr as t_firstNameAr, t.lastNameAr as t_lastNameAr,
        t.numericId as t_numericId, t.slug as t_slug, t.avatarUrl as t_avatarUrl, t.schoolName as t_schoolName, t.schoolNameAr as t_schoolNameAr
      FROM Resource r
      LEFT JOIN Subject s ON r.subjectId = s.id
      LEFT JOIN \`Class\` cl ON r.classId = cl.id
      LEFT JOIN Level lv ON cl.levelId = lv.id
      LEFT JOIN Section sec ON r.sectionId = sec.id
      LEFT JOIN User t ON r.teacherId = t.id
      WHERE r.numericId = ?
      LIMIT 1
    `).bind(numericId).first();
    
    if (!r) return null;
    
    // Visibility check
    const isOwner = userSession && userSession.id === r.teacherId;
    const isAdmin = userSession && userSession.role === 'ADMIN';
    if (r.status !== 'PUBLISHED' && r.status !== 'ARCHIVED' && !isOwner && !isAdmin) {
      return null;
    }
    
    // Safe query helper - never throws
    const safeFirst = async (sql: string, ...args: any[]): Promise<any> => {
      try { return await db.prepare(sql).bind(...args).first(); }
      catch (e) { return null; }
    };
    const safeAll = async (sql: string, ...args: any[]): Promise<any[]> => {
      try { const r = await db.prepare(sql).bind(...args).all(); return r?.results || []; }
      catch (e) { return []; }
    };
    
    // Related data - each query isolated
    const metadataRow = await safeFirst('SELECT systemName, subject, profNames, dossierTechnique, shortKeyPoints, keyPoints, topics, level, estimatedTimeMinutes, prerequisites, keyInsights, exerciseInsights FROM ResourceMetadata WHERE resourceId = ?', r.id);
    const contentRow = await safeFirst('SELECT text, pages, wordCount FROM ResourceContent WHERE resourceId = ?', r.id);
    const summaryRow = await safeFirst('SELECT summary, language FROM ResourceSummary WHERE resourceId = ?', r.id);
    const sectionData = r.sectionId ? await safeFirst('SELECT id, slug, nameFr, nameAr FROM Section WHERE id = ?', r.sectionId) : null;
    const teacherFull = r.t_id ? await safeFirst('SELECT schoolName, schoolNameAr FROM User WHERE id = ?', r.t_id) : null;
    const ratings = await safeAll('SELECT r.id, r.value as stars, r.createdAt FROM Rating r WHERE r.resourceId = ? ORDER BY r.createdAt DESC LIMIT 100', r.id);
    const comments = await safeAll('SELECT c.id, c.content, c.createdAt, c.isHidden, u.id as user_id, u.firstName, u.lastName, u.avatarUrl FROM Comment c LEFT JOIN User u ON c.userId = u.id WHERE c.resourceId = ? AND c.isHidden = 0 ORDER BY c.createdAt DESC LIMIT 50', r.id);
    const similarRows = r.subjectId ? await safeAll(`
      SELECT r.id, r.numericId, r.slug, r.title, r.viewsCount, r.downloadsCount, r.avgRating, r.commentsCount,
             s.nameFr as subjectName, s.color as subjectColor,
             cl.nameFr as className, cl.slug as classSlug
      FROM Resource r
      LEFT JOIN Subject s ON r.subjectId = s.id
      LEFT JOIN \`Class\` cl ON r.classId = cl.id
      WHERE r.subjectId = ? AND r.id != ? AND r.status = 'PUBLISHED'
      ORDER BY r.viewsCount DESC
      LIMIT 4
    `, r.subjectId, r.id) : [];
    
    // Build resource object (prisma-compatible shape)
    const resource: any = {
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
      year: r.year,
      trimester: r.trimester,
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
      class: r.cl_id ? { id: r.cl_id, slug: r.cl_slug, nameFr: r.cl_nameFr, nameAr: r.cl_nameAr, levelId: r.cl_levelId, numericId: r.cl_numericId, level: r.lv_id ? { id: r.lv_id, slug: r.lv_slug, nameFr: r.lv_nameFr, nameAr: r.lv_nameAr } : null } : null,
      section: sectionData ? { id: sectionData.id, slug: sectionData.slug, nameFr: sectionData.nameFr, nameAr: sectionData.nameAr } : null,
      teacher: r.t_id ? { id: r.t_id, numericId: r.t_numericId, slug: r.t_slug, firstName: r.t_firstName, lastName: r.t_lastName, firstNameAr: r.t_firstNameAr, lastNameAr: r.t_lastNameAr, avatarUrl: r.t_avatarUrl, schoolName: teacherFull?.schoolName || r.t_schoolName, schoolNameAr: teacherFull?.schoolNameAr || r.t_schoolNameAr } : null,
      metadata: metadataRow ? { systemName: metadataRow.systemName, subject: metadataRow.subject, profNames: metadataRow.profNames, dossierTechnique: metadataRow.dossierTechnique, shortKeyPoints: metadataRow.shortKeyPoints, keyPoints: metadataRow.keyPoints, topics: metadataRow.topics, level: metadataRow.level, estimatedTimeMinutes: metadataRow.estimatedTimeMinutes, prerequisites: metadataRow.prerequisites, keyInsights: metadataRow.keyInsights, exerciseInsights: metadataRow.exerciseInsights } : null,
      content: contentRow ? { text: contentRow.text, pages: contentRow.pages, wordCount: contentRow.wordCount } : null,
      aiSummary: summaryRow ? { summary: summaryRow.summary, language: summaryRow.language } : null,
      ratings,
      comments: comments.map((c: any) => ({
        id: c.id,
        content: c.content,
        createdAt: c.createdAt ? new Date(c.createdAt).toISOString() : new Date().toISOString(),
        user: { firstName: c.firstName, lastName: c.lastName, avatarUrl: c.avatarUrl },
      })),
    };
    
    // Increment view count (fire and forget)
    db.prepare('UPDATE Resource SET viewsCount = viewsCount + 1 WHERE id = ?').bind(r.id).run().catch(() => {});
    
    const similar = similarRows.map((s: any) => ({
      id: s.id, numericId: s.numericId, slug: s.slug, title: s.title,
      viewsCount: s.viewsCount || 0, downloadsCount: s.downloadsCount || 0,
      avgRating: s.avgRating || 0, commentsCount: s.commentsCount || 0,
      subject: s.subjectName ? { nameFr: s.subjectName, color: s.subjectColor } : null,
      class: s.className ? { nameFr: s.className, slug: s.classSlug } : null,
    }));
    
    // Aggregate rating
    const aggregateRating = ratings.length > 0
      ? { ratingCount: ratings.length, ratingValue: Math.round((ratings.reduce((s: number, x: any) => s + x.stars, 0) / ratings.length) * 10) / 10 }
      : null;
    
    return {
      resource,
      ratings,
      comments: resource.comments,
      similar,
      aggregateRating,
      userSession: userSession ? { id: userSession.id, role: userSession.role } : null,
    };
  } catch (e: any) {
    console.error('[fetchResourceDetail] fatal error:', e?.message);
    return null;
  }
}
