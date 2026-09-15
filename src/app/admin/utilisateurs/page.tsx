// @ts-nocheck
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import UsersManagementClient from '@/components/admin/UsersManagementClient';
import { cachedD1Query, invalidateCache } from '@/lib/kv-cache';

export const dynamic = 'force-dynamic';

async function getD1() {
  const { getCloudflareContext } = await import('@opennextjs/cloudflare');
  const ctx = await getCloudflareContext({ async: true });
  return (ctx as any).env.DB;
}

const ALLOWED_PAGE_SIZES = [10, 25, 50, 100];

const SORT_MAP: Record<string, { col: string; dir: 'ASC' | 'DESC' }> = {
  recent: { col: 'u.createdAt', dir: 'DESC' },
  oldest: { col: 'u.createdAt', dir: 'ASC' },
  name_asc: { col: 'u.lastName', dir: 'ASC' },
  name_desc: { col: 'u.lastName', dir: 'DESC' },
  last_login: { col: 'u.lastLoginAt', dir: 'DESC' },
};

// 2026-09-14: Map a raw D1 row to a User object with role-specific stats.
// lastLoginAt falls back to the latest Session if the column is NULL
// (covers legacy users from before migration 0026).
function mapUserRow(row: any, role: string) {
  const lastSessionAt = row.lastSessionAt ? new Date(row.lastSessionAt).toISOString() : null;
  const lastLoginAt = row.lastLoginAt
    ? new Date(row.lastLoginAt).toISOString()
    : lastSessionAt; // fallback

  return {
    id: row.id,
    numericId: row.numericId,
    slug: row.slug,
    email: row.email,
    firstName: row.firstName,
    lastName: row.lastName,
    role: row.role,
    status: row.status,
    isVerifiedTeacher: !!row.isVerifiedTeacher,
    schoolName: row.schoolName,
    createdAt: row.createdAt ? new Date(row.createdAt).toISOString() : null,
    lastLoginAt,
    lastSessionAt,
    invitationStatus: null,
    invitationSentAt: null,
    invitationActivatedAt: null,
    lastInvitationId: null,
    _count: { uploadedFiles: row.fileCount || 0 },
    stats: {
      fileCount: row.fileCount || 0,
      totalViews: row.totalViews || row.viewCount || 0,
      totalDownloads: row.totalDownloads || row.downloadCount || 0,
      totalFavorites: row.totalFavorites || row.favCount || 0,
      totalComments: row.totalComments || row.commentCount || 0,
      weightedRating: row.weightedRating || 0,
      ratingCount: row.ratingCount || 0,
      lastActivityAt: row.lastActivityAt ? new Date(row.lastActivityAt).toISOString() : null,
    },
  };
}

export default async function AdminUsersPage(props: {
  searchParams: Promise<any>;
}) {
  const sp = await props.searchParams;
  const user = await getCurrentUser();
  if (!user) redirect('/connexion');
  if (user.role !== 'ADMIN') redirect('/');

  const q = sp?.q || '';
  const role = sp?.role || 'TEACHER';
  const sort = sp?.sort || 'recent';
  const page = Math.max(1, parseInt(sp?.page || '1'));
  const requestedSize = parseInt(sp?.size || '25');
  const pageSize = ALLOWED_PAGE_SIZES.includes(requestedSize) ? requestedSize : 25;
  const skip = (page - 1) * pageSize;

  const db = await getD1();

  // Build WHERE clause
  const where: string[] = ['u.role = ?'];
  const params: any[] = [role];
  if (q) {
    where.push('(u.email LIKE ? OR u.firstName LIKE ? OR u.lastName LIKE ?)');
    params.push(`%${q}%`, `%${q}%`, `%${q}%`);
  }
  const whereSql = where.join(' AND ');

  const isStatsSort = ['files', 'views', 'downloads', 'favorites', 'comments', 'rating'].includes(sort);

  // Counts (always) — PERF 2026-09-02: batch the 3 role counts into 1 query (Step 9).
  // Previously: 3 separate queries + 3 cache keys. Now: 1 query + 1 cache key.
  // filteredTotalR is NOT cached because it depends on search params.
  const [roleCounts, filteredTotalR] = await Promise.all([
    cachedD1Query({
      key: 'user-counts-v1',
      ttl: 60,
      query: () =>
        db
          .prepare(
            [
              'SELECT',
              "  (SELECT COUNT(*) FROM User WHERE role = 'TEACHER') AS teacherCount,",
              "  (SELECT COUNT(*) FROM User WHERE role = 'STUDENT') AS studentCount,",
              "  (SELECT COUNT(*) FROM User WHERE role = 'ADMIN') AS adminCount",
            ].join('\n'),
          )
          .first()
          .catch(() => ({ teacherCount: 0, studentCount: 0, adminCount: 0 })),
    }),
    db.prepare(`SELECT COUNT(*) as c FROM User u WHERE ${whereSql}`).bind(...params).first().catch(() => ({ c: 0 })),
  ]);
  const teacherCount = { c: roleCounts?.teacherCount || 0 };
  const studentCount = { c: roleCounts?.studentCount || 0 };
  const adminCount = { c: roleCounts?.adminCount || 0 };

  // Build user query
  let usersRaw: any[];

  // 2026-09-14: Build stats CTEs based on role.
  // - TEACHER: aggregate on their uploaded Resources
  // - STUDENT: aggregate on their View/Download/Comment/Rating/Favorite activity
  // - ADMIN: no stats
  // lastLoginAt is COALESCE'd with the latest Session timestamp as a fallback
  // for users whose lastLoginAt column is still NULL (e.g. legacy users before
  // migration 0026 populated it from Session).
  const teacherStatsCte = `
    teacher_stats AS (
      SELECT teacherId,
        COUNT(*) AS file_count,
        COALESCE(SUM(viewsCount), 0) AS total_views,
        COALESCE(SUM(downloadsCount), 0) AS total_downloads,
        COALESCE(SUM(favoritesCount), 0) AS total_favorites,
        COALESCE(SUM(commentsCount), 0) AS total_comments,
        CASE WHEN SUM(ratingsCount) > 0
          THEN SUM(avgRating * ratingsCount) / SUM(ratingsCount)
          ELSE 0
        END AS weighted_rating
      FROM Resource
      WHERE teacherId IS NOT NULL
      GROUP BY teacherId
    )`;

  const studentStatsCte = `
    student_stats AS (
      SELECT
        v.userId AS userId,
        COALESCE(v.view_count, 0) AS view_count,
        COALESCE(d.download_count, 0) AS download_count,
        COALESCE(c.comment_count, 0) AS comment_count,
        COALESCE(r.rating_count, 0) AS rating_count,
        COALESCE(f.fav_count, 0) AS fav_count,
        -- Last activity = MAX of all activity timestamps
        MAX(
          COALESCE(v.last_view, 0),
          COALESCE(d.last_download, 0),
          COALESCE(c.last_comment, 0),
          COALESCE(r.last_rating, 0),
          COALESCE(f.last_fav, 0)
        ) AS last_activity
      FROM User u
      LEFT JOIN (SELECT userId, COUNT(*) AS view_count, MAX(createdAt) AS last_view
                 FROM View WHERE userId IS NOT NULL GROUP BY userId) v ON v.userId = u.id
      LEFT JOIN (SELECT userId, COUNT(*) AS download_count, MAX(createdAt) AS last_download
                 FROM Download WHERE userId IS NOT NULL GROUP BY userId) d ON d.userId = u.id
      LEFT JOIN (SELECT userId, COUNT(*) AS comment_count, MAX(createdAt) AS last_comment
                 FROM Comment WHERE userId IS NOT NULL GROUP BY userId) c ON c.userId = u.id
      LEFT JOIN (SELECT userId, COUNT(*) AS rating_count, MAX(createdAt) AS last_rating
                 FROM Rating WHERE userId IS NOT NULL GROUP BY userId) r ON r.userId = u.id
      LEFT JOIN (SELECT userId, COUNT(*) AS fav_count, MAX(createdAt) AS last_fav
                 FROM Favorite WHERE userId IS NOT NULL GROUP BY userId) f ON f.userId = u.id
      GROUP BY u.id
    )`;

  // Build a common SELECT clause. lastLoginAt is COALESCE'd with MAX(Session.createdAt)
  // so users who logged in before the column existed still show a value.
  const baseSelect = `
    SELECT u.id, u.numericId, u.slug, u.email, u.firstName, u.lastName, u.role, u.status,
      u.isVerifiedTeacher, u.schoolName, u.createdAt,
      (SELECT MAX(s.createdAt) FROM Session s WHERE s.userId = u.id) AS lastSessionAt,
      u.lastLoginAt,
      ${
        role === 'TEACHER'
          ? `COALESCE(ts.file_count, 0) AS fileCount,
              COALESCE(ts.total_views, 0) AS totalViews,
              COALESCE(ts.total_downloads, 0) AS totalDownloads,
              COALESCE(ts.total_favorites, 0) AS totalFavorites,
              COALESCE(ts.total_comments, 0) AS totalComments,
              COALESCE(ts.weighted_rating, 0) AS weightedRating`
          : role === 'STUDENT'
            ? `COALESCE(ss.view_count, 0) AS viewCount,
                COALESCE(ss.download_count, 0) AS downloadCount,
                COALESCE(ss.comment_count, 0) AS commentCount,
                COALESCE(ss.rating_count, 0) AS ratingCount,
                COALESCE(ss.fav_count, 0) AS favCount,
                ss.last_activity AS lastActivityAt`
            : `0 AS viewCount, 0 AS downloadCount, 0 AS commentCount,
                0 AS ratingCount, 0 AS favCount, 0 AS lastActivityAt`
      }`;

  const baseFrom = `
    FROM User u
    ${
      role === 'TEACHER'
        ? `LEFT JOIN teacher_stats ts ON ts.teacherId = u.id`
        : role === 'STUDENT'
          ? `LEFT JOIN student_stats ss ON ss.userId = u.id`
          : ''
    }
    WHERE ${whereSql}`;

  // Stats-based sort requires aggregation
  // 2026-09-15: Skip the WITH clause entirely for ADMIN (no CTE needed)
  // to avoid generating `WITH  SELECT` (invalid SQL).
  if (isStatsSort) {
    const STATS_COLS: Record<string, string> = {
      // TEACHER columns
      files: 'COALESCE(ts.file_count, 0)',
      // Both roles share these names (mapped per role below)
      views:
        role === 'TEACHER'
          ? 'COALESCE(ts.total_views, 0)'
          : 'COALESCE(ss.view_count, 0)',
      downloads:
        role === 'TEACHER'
          ? 'COALESCE(ts.total_downloads, 0)'
          : 'COALESCE(ss.download_count, 0)',
      favorites:
        role === 'TEACHER'
          ? 'COALESCE(ts.total_favorites, 0)'
          : 'COALESCE(ss.fav_count, 0)',
      comments:
        role === 'TEACHER'
          ? 'COALESCE(ts.total_comments, 0)'
          : 'COALESCE(ss.comment_count, 0)',
      rating:
        role === 'TEACHER'
          ? 'COALESCE(ts.weighted_rating, 0)'
          : 'COALESCE(ss.rating_count, 0)',
    };
    const orderCol = STATS_COLS[sort];

    const cte = role === 'TEACHER' ? teacherStatsCte : role === 'STUDENT' ? studentStatsCte : '';
    const withClause = cte ? `WITH ${cte}` : '';
    const r = await db
      .prepare(
        `${withClause}
        ${baseSelect}
        ${baseFrom}
        ORDER BY ${orderCol} DESC, u.createdAt DESC
        LIMIT ? OFFSET ?`,
      )
      .bind(...params, pageSize, skip)
      .all()
      .catch(() => ({ results: [] }));
    usersRaw = (r?.results || []).map((row: any) => mapUserRow(row, role));
  } else {
    // Normal sort
    const orderBy = SORT_MAP[sort] || SORT_MAP.recent;
    const cte = role === 'TEACHER' ? teacherStatsCte : role === 'STUDENT' ? studentStatsCte : '';
    const withClause = cte ? `WITH ${cte}` : '';
    const r = await db
      .prepare(
        `${withClause}
        ${baseSelect}
        ${baseFrom}
        ORDER BY ${orderBy.col} ${orderBy.dir}
        LIMIT ? OFFSET ?`,
      )
      .bind(...params, pageSize, skip)
      .all()
      .catch(() => ({ results: [] }));
    usersRaw = (r?.results || []).map((row: any) => mapUserRow(row, role));
  }

  const counts = {
    TEACHER: Number(teacherCount?.c || 0),
    STUDENT: Number(studentCount?.c || 0),
    ADMIN: Number(adminCount?.c || 0),
    TOTAL: Number(teacherCount?.c || 0) + Number(studentCount?.c || 0) + Number(adminCount?.c || 0),
  };

  return (
    <UsersManagementClient
      initialUsers={usersRaw}
      initialCounts={counts}
      initialRole={role}
      initialSearch={q}
      initialPage={page}
      initialPageSize={pageSize}
      initialSort={sort}
      totalFiltered={Number(filteredTotalR?.c || 0)}
    />
  );
}
