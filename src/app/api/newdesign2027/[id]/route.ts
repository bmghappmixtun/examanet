// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';

export const dynamic = 'force-dynamic';

export async function GET(
  _req: NextRequest,
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
    if (!db) {
      return NextResponse.json({ error: 'DB unavailable' }, { status: 500 });
    }

    const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://examanet.com';

    // Main resource
    const main: any = await db.prepare(`
      SELECT
        r.id, r.numericId, r.slug, r.title, r.description, r.summary, r.type, r.language,
        r.schoolType, r.hasCorrection, r.fileKey, r.fileUrl, r.fileSize, r.pageCount,
        r.tags, r.viewsCount, r.downloadsCount, r.avgRating, r.ratingsCount,
        r.commentsCount, r.favoritesCount, r.publishedAt, r.createdAt, r.updatedAt,
        s.id as subjectId, s.slug as subjectSlug, s.nameFr as subjectNameFr, s.color as subjectColor,
        cl.id as classId, cl.slug as classSlug, cl.nameFr as classNameFr,
        lv.id as levelId, lv.slug as levelSlug, lv.nameFr as levelNameFr,
        u.id as teacherId, u.firstName as teacherFirstName, u.lastName as teacherLastName,
        u.firstNameAr as teacherFirstNameAr, u.lastNameAr as teacherLastNameAr,
        u.slug as teacherSlug, u.numericId as teacherNumericId, u.avatarUrl as teacherAvatar,
        u.schoolName as teacherSchool, u.isVerifiedTeacher as teacherIsVerified
      FROM Resource r
      LEFT JOIN Subject s ON r.subjectId = s.id
      LEFT JOIN "Class" cl ON r.classId = cl.id
      LEFT JOIN Level lv ON cl.levelId = lv.id
      LEFT JOIN User u ON r.teacherId = u.id
      WHERE r.numericId = ? AND r.status = 'PUBLISHED' AND r.isHidden = 0
      LIMIT 1
    `).bind(numericId).first();

    if (!main) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    // Teacher aggregate stats (only if resource has a teacher)
    let teacherStats: any = null;
    if (main.teacherId) {
      teacherStats = await db.prepare(`
        SELECT
          (SELECT COUNT(*) FROM Resource WHERE teacherId = ? AND status = 'PUBLISHED' AND isHidden = 0) as resourcesCount,
          COALESCE((SELECT SUM(viewsCount) FROM Resource WHERE teacherId = ? AND status = 'PUBLISHED' AND isHidden = 0), 0) as totalViews,
          COALESCE((SELECT SUM(downloadsCount) FROM Resource WHERE teacherId = ? AND status = 'PUBLISHED' AND isHidden = 0), 0) as totalDownloads,
          COALESCE((SELECT SUM(favoritesCount) FROM Resource WHERE teacherId = ? AND status = 'PUBLISHED' AND isHidden = 0), 0) as totalFavorites,
          (SELECT COUNT(*) FROM Follow WHERE followingId = ?) as followersCount
      `).bind(
        main.teacherId, main.teacherId, main.teacherId, main.teacherId, main.teacherId
      ).first().catch(() => null);
    }

    // Rating distribution + initial comments for live-site parity
    const ratingDistRes: any = await db.prepare(`
      SELECT value as star, COUNT(*) as count FROM Rating
      WHERE resourceId = ? GROUP BY value ORDER BY value DESC
    `).bind(main.id).all().catch(() => ({ results: [] }));
    const ratingDistribution = [5, 4, 3, 2, 1].map((star) => {
      const found = (ratingDistRes.results || []).find((r: any) => r.star === star);
      return { star, count: found?.count || 0 };
    });
    const ratingMaxCount = Math.max(...ratingDistribution.map((d: any) => d.count), 1);

    const commentsRes: any = await db.prepare(`
      SELECT c.id, c.content, c.createdAt, c.userId,
             u.firstName, u.lastName, u.avatarUrl
      FROM Comment c LEFT JOIN User u ON c.userId = u.id
      WHERE c.resourceId = ? AND c.isHidden = 0
      ORDER BY c.createdAt DESC LIMIT 20
    `).bind(main.id).all().catch(() => ({ results: [] }));
    const initialComments = (commentsRes.results || []).map((c: any) => ({
      id: c.id,
      content: c.content,
      createdAt: c.createdAt,
      user: {
        firstName: c.firstName || '',
        lastName: c.lastName || '',
        avatarUrl: c.avatarUrl || null,
      },
    }));

    // Build the tag-based related query dynamically (LIKE %tag% OR ...)
    const tagList = (main.tags || '').split(',').map((t: string) => t.trim()).filter(Boolean);
    let relatedByTagsRes: any = { results: [] };
    if (tagList.length > 0) {
      const tagConditions = tagList.map(() => "r.tags LIKE ?").join(' OR ');
      const tagParams = tagList.map((t: string) => `%${t}%`);
      relatedByTagsRes = await db.prepare(`
        SELECT r.numericId, r.slug, r.title, r.type, r.hasCorrection, r.viewsCount, r.avgRating
        FROM Resource r
        WHERE r.numericId != ?
          AND r.status = 'PUBLISHED' AND r.isHidden = 0
          AND r.tags IS NOT NULL AND r.tags != ''
          AND (${tagConditions})
        ORDER BY RANDOM() LIMIT 20
      `).bind(numericId, ...tagParams).all().catch(() => ({ results: [] }));
    }

    // Run all queries in parallel
    const [
      sameTeacherRes,
      byTypeAndClassRes,
      otherClassesSameLevelRes,
      otherTeachersSameSubjRes,
      corrigesRes,
      otherSubjectsSameLevelRes,
      sidebarTopViewedRes,
      sidebarTopRatedRes,
      sidebarTopCommentedRes,
    ] = await Promise.all([
      // 1. sameTeacher (teacherId)
      db.prepare(`
        SELECT numericId, slug, title, type, hasCorrection, viewsCount, avgRating, publishedAt
        FROM Resource WHERE teacherId = ? AND numericId != ? AND status = 'PUBLISHED' AND isHidden = 0
        ORDER BY RANDOM() LIMIT 20
      `).bind(main.teacherId, numericId).all().catch(() => ({ results: [] })),

      // 2. byTypeAndClass (subjectId+classId)
      db.prepare(`
        SELECT numericId, slug, title, type, hasCorrection, viewsCount, avgRating, publishedAt
        FROM Resource WHERE subjectId = ? AND classId = ? AND numericId != ?
          AND status = 'PUBLISHED' AND isHidden = 0
        ORDER BY RANDOM() LIMIT 20
      `).bind(main.subjectId, main.classId, numericId).all().catch(() => ({ results: [] })),

      // 3. otherClassesSameLevel
      db.prepare(`
        SELECT r.numericId, r.slug, r.title, cl.nameFr as classNameFr, r.type, r.viewsCount
        FROM Resource r LEFT JOIN "Class" cl ON r.classId = cl.id
        WHERE r.levelId = ? AND r.classId != ? AND r.subjectId = ? AND r.numericId != ?
          AND r.status = 'PUBLISHED' AND r.isHidden = 0
        ORDER BY r.viewsCount DESC LIMIT 8
      `).bind(main.levelId, main.classId, main.subjectId, numericId).all().catch(() => ({ results: [] })),

      // 4. otherTeachersSameSubj (User table — TEACHER data)
      db.prepare(`
        SELECT u.id, u.firstName, u.lastName, u.avatarUrl, u.numericId, u.slug, u.isVerifiedTeacher, u.schoolName,
               COUNT(r.numericId) as resourceCount
        FROM User u INNER JOIN Resource r ON r.teacherId = u.id
        WHERE r.subjectId = ? AND r.classId = ? AND u.id != ?
          AND r.status = 'PUBLISHED' AND r.isHidden = 0
          AND u.role = 'TEACHER' AND u.status = 'ACTIVE'
        GROUP BY u.id ORDER BY RANDOM() LIMIT 20
      `).bind(main.subjectId, main.classId, main.teacherId).all().catch(() => ({ results: [] })),

      // 5. corriges (hasCorrection = 1)
      db.prepare(`
        SELECT numericId, slug, title, type, viewsCount, avgRating, publishedAt
        FROM Resource WHERE subjectId = ? AND classId = ? AND numericId != ? AND hasCorrection = 1
          AND status = 'PUBLISHED' AND isHidden = 0
        ORDER BY RANDOM() LIMIT 20
      `).bind(main.subjectId, main.classId, numericId).all().catch(() => ({ results: [] })),

      // 6. otherSubjectsSameLevel (Subject table)
      db.prepare(`
        SELECT s.id, s.slug, s.nameFr, s.color,
               (SELECT COUNT(*) FROM Resource r WHERE r.subjectId = s.id AND r.levelId = ? AND r.status = 'PUBLISHED' AND r.isHidden = 0) as count
        FROM Subject s WHERE s.id != ?
        HAVING count > 0 ORDER BY count DESC LIMIT 10
      `).bind(main.levelId, main.subjectId).all().catch(() => ({ results: [] })),

      // 7. SIDEBAR: top viewed in same subject + same level
      db.prepare(`
        SELECT r.numericId, r.slug, r.title, r.type, r.viewsCount, r.avgRating, cl.nameFr as classNameFr
        FROM Resource r LEFT JOIN "Class" cl ON r.classId = cl.id
        WHERE r.subjectId = ? AND r.numericId != ?
          AND cl.levelId = ?
          AND r.status = 'PUBLISHED' AND r.isHidden = 0
        ORDER BY r.viewsCount DESC LIMIT 20
      `).bind(main.subjectId, numericId, main.levelId).all().catch(() => ({ results: [] })),

      // 8. SIDEBAR: top rated in same subject + same level
      db.prepare(`
        SELECT r.numericId, r.slug, r.title, r.type, r.viewsCount, r.avgRating, r.ratingsCount, cl.nameFr as classNameFr
        FROM Resource r LEFT JOIN "Class" cl ON r.classId = cl.id
        WHERE r.subjectId = ? AND r.numericId != ? AND r.ratingsCount > 0
          AND cl.levelId = ?
          AND r.status = 'PUBLISHED' AND r.isHidden = 0
        ORDER BY r.ratingsCount DESC, r.avgRating DESC LIMIT 20
      `).bind(main.subjectId, numericId, main.levelId).all().catch(() => ({ results: [] })),

      // 9. SIDEBAR: top commented in same subject + same level
      db.prepare(`
        SELECT r.numericId, r.slug, r.title, r.type, r.viewsCount, r.avgRating, r.commentsCount, cl.nameFr as classNameFr
        FROM Resource r LEFT JOIN "Class" cl ON r.classId = cl.id
        WHERE r.subjectId = ? AND r.numericId != ? AND r.commentsCount > 0
          AND cl.levelId = ?
          AND r.status = 'PUBLISHED' AND r.isHidden = 0
        ORDER BY r.commentsCount DESC, r.viewsCount DESC LIMIT 20
      `).bind(main.subjectId, numericId, main.levelId).all().catch(() => ({ results: [] })),
    ]);

    return NextResponse.json({
      main,
      teacherStats,
      sameTeacher: sameTeacherRes.results || [],
      byTypeAndClass: byTypeAndClassRes.results || [],
      otherClassesSameLevel: otherClassesSameLevelRes.results || [],
      otherTeachersSameSubj: otherTeachersSameSubjRes.results || [],
      corriges: corrigesRes.results || [],
      relatedByTags: relatedByTagsRes.results || [],
      otherSubjectsSameLevel: otherSubjectsSameLevelRes.results || [],
      sidebarTopViewed: sidebarTopViewedRes.results || [],
      sidebarTopRated: sidebarTopRatedRes.results || [],
      sidebarTopCommented: sidebarTopCommentedRes.results || [],
      ratingDistribution,
      ratingMaxCount,
      initialComments,
      tagList,
      SITE_URL,
    });
  } catch (e: any) {
    console.error('[newdesign2027 API] error:', e.message);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
