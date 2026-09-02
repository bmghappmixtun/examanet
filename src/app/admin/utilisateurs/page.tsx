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

  // Counts (always) — PERF 2026-09-02: cache role counts (60s TTL)
  // These change only when users are added/removed, so 60s is safe.
  // filteredTotalR is NOT cached because it depends on search params.
  const [teacherCount, studentCount, adminCount, filteredTotalR] = await Promise.all([
    cachedD1Query({
      key: 'user-count-teacher-v1',
      ttl: 60,
      query: () => db.prepare("SELECT COUNT(*) as c FROM User WHERE role = 'TEACHER'").first().catch(() => ({ c: 0 })),
    }),
    cachedD1Query({
      key: 'user-count-student-v1',
      ttl: 60,
      query: () => db.prepare("SELECT COUNT(*) as c FROM User WHERE role = 'STUDENT'").first().catch(() => ({ c: 0 })),
    }),
    cachedD1Query({
      key: 'user-count-admin-v1',
      ttl: 60,
      query: () => db.prepare("SELECT COUNT(*) as c FROM User WHERE role = 'ADMIN'").first().catch(() => ({ c: 0 })),
    }),
    db.prepare(`SELECT COUNT(*) as c FROM User u WHERE ${whereSql}`).bind(...params).first().catch(() => ({ c: 0 })),
  ]);

  // Build user query
  let usersRaw: any[];
  if (isStatsSort) {
    // Stats-based sort requires aggregation
    const STATS_COLS: Record<string, string> = {
      files: 'COALESCE(ts.file_count, 0)',
      views: 'COALESCE(ts.total_views, 0)',
      downloads: 'COALESCE(ts.total_downloads, 0)',
      favorites: 'COALESCE(ts.total_favorites, 0)',
      comments: 'COALESCE(ts.total_comments, 0)',
      rating: 'COALESCE(ts.weighted_rating, 0)',
    };
    const orderCol = STATS_COLS[sort];
    const r = await db
      .prepare(
        `WITH teacher_stats AS (
          SELECT teacherId,
            COUNT(*) AS file_count,
            COALESCE(SUM(viewsCount), 0) AS total_views,
            COALESCE(SUM(downloadsCount), 0) AS total_downloads,
            COALESCE(SUM(favoritesCount), 0) AS total_favorites,
            COALESCE(SUM(commentsCount), 0) AS total_comments,
            CASE WHEN SUM(ratingCount) > 0
              THEN SUM(avgRating * ratingCount) / SUM(ratingCount)
              ELSE 0
            END AS weighted_rating
          FROM Resource
          WHERE teacherId IS NOT NULL
          GROUP BY teacherId
        )
        SELECT u.id, u.numericId, u.slug, u.email, u.firstName, u.lastName, u.role, u.status,
          u.isVerifiedTeacher, u.schoolName, u.createdAt, u.lastLoginAt,
          COALESCE(ts.file_count, 0) AS fileCount,
          COALESCE(ts.total_views, 0) AS totalViews,
          COALESCE(ts.total_downloads, 0) AS totalDownloads,
          COALESCE(ts.total_favorites, 0) AS totalFavorites,
          COALESCE(ts.total_comments, 0) AS totalComments,
          COALESCE(ts.weighted_rating, 0) AS weightedRating
        FROM User u
        LEFT JOIN teacher_stats ts ON ts.teacherId = u.id
        WHERE ${whereSql}
        ORDER BY ${orderCol} DESC, u.createdAt DESC
        LIMIT ? OFFSET ?`,
      )
      .bind(...params, pageSize, skip)
      .all()
      .catch(() => ({ results: [] }));
    usersRaw = (r?.results || []).map((row: any) => ({
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
      lastLoginAt: row.lastLoginAt ? new Date(row.lastLoginAt).toISOString() : null,
      invitationStatus: null,
      invitationSentAt: null,
      invitationActivatedAt: null,
      lastInvitationId: null,
      _count: { uploadedFiles: row.fileCount || 0 },
      stats: {
        fileCount: row.fileCount,
        totalViews: row.totalViews,
        totalDownloads: row.totalDownloads,
        totalFavorites: row.totalFavorites,
        totalComments: row.totalComments,
        weightedRating: row.weightedRating,
      },
    }));
  } else {
    // Normal sort
    const orderBy = SORT_MAP[sort] || SORT_MAP.recent;
    const r = await db
      .prepare(
        `SELECT u.id, u.numericId, u.slug, u.email, u.firstName, u.lastName, u.role, u.status,
          u.isVerifiedTeacher, u.schoolName, u.createdAt, u.lastLoginAt,
          (SELECT COUNT(*) FROM Resource r WHERE r.teacherId = u.id) AS fileCount
        FROM User u
        WHERE ${whereSql}
        ORDER BY ${orderBy.col} ${orderBy.dir}
        LIMIT ? OFFSET ?`,
      )
      .bind(...params, pageSize, skip)
      .all()
      .catch(() => ({ results: [] }));
    usersRaw = (r?.results || []).map((row: any) => ({
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
      lastLoginAt: row.lastLoginAt ? new Date(row.lastLoginAt).toISOString() : null,
      invitationStatus: null,
      invitationSentAt: null,
      invitationActivatedAt: null,
      lastInvitationId: null,
      _count: { uploadedFiles: row.fileCount || 0 },
    }));
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
