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

    // Run all queries in parallel
    const [
      sameTeacherRes,
      byTypeAndClassRes,
      newestRes,
      topInSubjectRes,
      otherClassesSameLevelRes,
      otherTeachersSameSubjRes,
      sameSubjOtherClassesRes,
      corrigesRes,
      otherSubjectsSameLevelRes,
    ] = await Promise.all([
      db.prepare(`
        SELECT numericId, slug, title, type, hasCorrection, viewsCount, avgRating, publishedAt
        FROM Resource WHERE teacherId = ? AND numericId != ? AND status = 'PUBLISHED' AND isHidden = 0
        ORDER BY viewsCount DESC, publishedAt DESC LIMIT 10
      `).bind(main.teacherId, numericId).all().catch(() => ({ results: [] })),

      db.prepare(`
        SELECT numericId, slug, title, type, hasCorrection, viewsCount, avgRating, publishedAt
        FROM Resource WHERE subjectId = ? AND classId = ? AND numericId != ?
          AND status = 'PUBLISHED' AND isHidden = 0
        ORDER BY CASE type WHEN 'COURSE' THEN 1 WHEN 'DEVOIR' THEN 2 WHEN 'EXERCISE' THEN 3 ELSE 4 END, viewsCount DESC
        LIMIT 30
      `).bind(main.subjectId, main.classId, numericId).all().catch(() => ({ results: [] })),

      db.prepare(`
        SELECT numericId, slug, title, type, hasCorrection, viewsCount, publishedAt
        FROM Resource WHERE subjectId = ? AND classId = ? AND numericId != ?
          AND status = 'PUBLISHED' AND isHidden = 0 AND publishedAt > ?
        ORDER BY publishedAt DESC LIMIT 8
      `).bind(main.subjectId, main.classId, numericId, Date.now() - 90 * 24 * 60 * 60 * 1000).all().catch(() => ({ results: [] })),

      db.prepare(`
        SELECT r.numericId, r.slug, r.title, r.type, r.viewsCount, r.avgRating, cl.nameFr as classNameFr
        FROM Resource r LEFT JOIN "Class" cl ON r.classId = cl.id
        WHERE r.subjectId = ? AND r.numericId != ? AND r.status = 'PUBLISHED' AND r.isHidden = 0
        ORDER BY r.viewsCount DESC LIMIT 6
      `).bind(main.subjectId, numericId).all().catch(() => ({ results: [] })),

      db.prepare(`
        SELECT r.numericId, r.slug, r.title, cl.nameFr as classNameFr, r.type, r.viewsCount
        FROM Resource r LEFT JOIN "Class" cl ON r.classId = cl.id
        WHERE r.levelId = ? AND r.classId != ? AND r.subjectId = ? AND r.numericId != ?
          AND r.status = 'PUBLISHED' AND r.isHidden = 0
        ORDER BY r.viewsCount DESC LIMIT 8
      `).bind(main.levelId, main.classId, main.subjectId, numericId).all().catch(() => ({ results: [] })),

      db.prepare(`
        SELECT u.id, u.firstName, u.lastName, u.avatarUrl, u.numericId, u.slug, u.isVerifiedTeacher, u.schoolName,
               COUNT(r.numericId) as resourceCount
        FROM User u INNER JOIN Resource r ON r.teacherId = u.id
        WHERE r.subjectId = ? AND r.classId = ? AND u.id != ?
          AND r.status = 'PUBLISHED' AND r.isHidden = 0
          AND u.role = 'TEACHER' AND u.status = 'ACTIVE'
        GROUP BY u.id ORDER BY resourceCount DESC LIMIT 6
      `).bind(main.subjectId, main.classId, main.teacherId).all().catch(() => ({ results: [] })),

      db.prepare(`
        SELECT r.numericId, r.slug, r.title, cl.nameFr as classNameFr, lv.nameFr as levelNameFr, r.type, r.viewsCount
        FROM Resource r LEFT JOIN "Class" cl ON r.classId = cl.id LEFT JOIN Level lv ON cl.levelId = lv.id
        WHERE r.subjectId = ? AND r.classId != ? AND r.status = 'PUBLISHED' AND r.isHidden = 0
        ORDER BY r.viewsCount DESC LIMIT 8
      `).bind(main.subjectId, main.classId).all().catch(() => ({ results: [] })),

      db.prepare(`
        SELECT numericId, slug, title, type, viewsCount, avgRating, publishedAt
        FROM Resource WHERE subjectId = ? AND classId = ? AND numericId != ? AND hasCorrection = 1
          AND status = 'PUBLISHED' AND isHidden = 0
        ORDER BY avgRating DESC, viewsCount DESC LIMIT 6
      `).bind(main.subjectId, main.classId, numericId).all().catch(() => ({ results: [] })),

      db.prepare(`
        SELECT s.id, s.slug, s.nameFr, s.color,
               (SELECT COUNT(*) FROM Resource r WHERE r.subjectId = s.id AND r.levelId = ? AND r.status = 'PUBLISHED' AND r.isHidden = 0) as count
        FROM Subject s WHERE s.id != ?
        HAVING count > 0 ORDER BY count DESC LIMIT 10
      `).bind(main.levelId, main.subjectId).all().catch(() => ({ results: [] })),
    ]);

    return NextResponse.json({
      main,
      teacherStats,
      sameTeacher: sameTeacherRes.results || [],
      byTypeAndClass: byTypeAndClassRes.results || [],
      newest: newestRes.results || [],
      topInSubject: topInSubjectRes.results || [],
      otherClassesSameLevel: otherClassesSameLevelRes.results || [],
      otherTeachersSameSubj: otherTeachersSameSubjRes.results || [],
      sameSubjOtherClasses: sameSubjOtherClassesRes.results || [],
      corriges: corrigesRes.results || [],
      otherSubjectsSameLevel: otherSubjectsSameLevelRes.results || [],
      tagList: (main.tags || '').split(',').map((t: string) => t.trim()).filter(Boolean),
      SITE_URL,
    });
  } catch (e: any) {
    console.error('[newdesign2027 API] error:', e.message);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
