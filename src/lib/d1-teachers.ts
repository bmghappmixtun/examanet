// @ts-nocheck
// D1-based helper functions for the profs page.
// Replaces prisma-compat calls on CF Workers.

import { getD1 } from './d1-subjects';

export interface TeacherRow {
  id: string;
  numericId: number;
  slug: string;
  firstName: string;
  lastName: string;
  firstNameAr: string | null;
  lastNameAr: string | null;
  avatarUrl: string | null;
  bio: string | null;
  schoolName: string | null;
  schoolNameAr: string | null;
  schoolLevel: string | null;
  governorate: string | null;
  teachingSubjects: string | null;
  teachingLevels: string | null;
  isVerifiedTeacher: number | null;
  approvedAt: string | null;
  uploadsCount: number | null;
  followersCount: number | null;
  createdAt: string;
}

const TEACHER_FIELDS = `
  id, numericId, slug, firstName, lastName, firstNameAr, lastNameAr, avatarUrl,
  bio, schoolName, schoolNameAr, schoolLevel, governorate,
  teachingSubjects, teachingLevels, isVerifiedTeacher, approvedAt,
  uploadsCount, followersCount, createdAt
`;

export async function countTeachers(db: any, where: any = {}): Promise<number> {
  const conditions: string[] = ["role = 'TEACHER'", "status = 'ACTIVE'"];
  const params: any[] = [];
  
  if (where.isVerifiedTeacher) {
    conditions.push('isVerifiedTeacher = 1');
  }
  if (where.searchQuery) {
    conditions.push('(firstName LIKE ? OR lastName LIKE ? OR firstNameAr LIKE ? OR lastNameAr LIKE ? OR schoolName LIKE ?)');
    const q = `%${where.searchQuery}%`;
    params.push(q, q, q, q, q);
  }
  // Subject filter via resource existence
  if (where.subjectSlugs && where.subjectSlugs.length > 0) {
    const placeholders = where.subjectSlugs.map(() => '?').join(',');
    conditions.push(`id IN (
      SELECT DISTINCT r.teacherId FROM Resource r 
      JOIN Subject s ON r.subjectId = s.id
      WHERE r.status = 'PUBLISHED' AND s.slug IN (${placeholders}) AND r.teacherId IS NOT NULL
    )`);
    params.push(...where.subjectSlugs);
  }
  // Class filter
  if (where.classSlugs && where.classSlugs.length > 0) {
    const placeholders = where.classSlugs.map(() => '?').join(',');
    conditions.push(`id IN (
      SELECT DISTINCT r.teacherId FROM Resource r 
      JOIN Class c ON r.classId = c.id
      WHERE r.status = 'PUBLISHED' AND c.slug IN (${placeholders}) AND r.teacherId IS NOT NULL
    )`);
    params.push(...where.classSlugs);
  }
  
  const result = await db.prepare(`
    SELECT COUNT(*) as count FROM User
    WHERE ${conditions.join(' AND ')}
  `).bind(...params).first();
  return result?.count || 0;
}

export async function findTeachers(db: any, options: {
  where?: any;
  orderBy?: string;
  limit?: number;
  offset?: number;
}): Promise<TeacherRow[]> {
  const where = options.where || {};
  const conditions: string[] = ["role = 'TEACHER'", "status = 'ACTIVE'"];
  const params: any[] = [];
  
  if (where.isVerifiedTeacher) {
    conditions.push('isVerifiedTeacher = 1');
  }
  if (where.searchQuery) {
    conditions.push('(firstName LIKE ? OR lastName LIKE ? OR firstNameAr LIKE ? OR lastNameAr LIKE ? OR schoolName LIKE ?)');
    const q = `%${where.searchQuery}%`;
    params.push(q, q, q, q, q);
  }
  if (where.subjectSlugs && where.subjectSlugs.length > 0) {
    const placeholders = where.subjectSlugs.map(() => '?').join(',');
    conditions.push(`id IN (
      SELECT DISTINCT r.teacherId FROM Resource r 
      JOIN Subject s ON r.subjectId = s.id
      WHERE r.status = 'PUBLISHED' AND s.slug IN (${placeholders}) AND r.teacherId IS NOT NULL
    )`);
    params.push(...where.subjectSlugs);
  }
  if (where.classSlugs && where.classSlugs.length > 0) {
    const placeholders = where.classSlugs.map(() => '?').join(',');
    conditions.push(`id IN (
      SELECT DISTINCT r.teacherId FROM Resource r 
      JOIN Class c ON r.classId = c.id
      WHERE r.status = 'PUBLISHED' AND c.slug IN (${placeholders}) AND r.teacherId IS NOT NULL
    )`);
    params.push(...where.classSlugs);
  }
  
  // Order by
  let orderBy = 'firstName ASC';
  if (options.orderBy === 'recent') orderBy = 'createdAt DESC';
  if (options.orderBy === 'popular') orderBy = 'uploadsCount DESC, followersCount DESC';
  if (options.orderBy === 'followers') orderBy = 'followersCount DESC';
  
  // IDs filter (for manual sort)
  if (where.ids && where.ids.length > 0) {
    const placeholders = where.ids.map(() => '?').join(',');
    conditions.push(`id IN (${placeholders})`);
    params.push(...where.ids);
  }
  
  const limit = options.limit || 24;
  const offset = options.offset || 0;
  
  const result = await db.prepare(`
    SELECT ${TEACHER_FIELDS}
    FROM User
    WHERE ${conditions.join(' AND ')}
    ORDER BY ${orderBy}
    LIMIT ? OFFSET ?
  `).bind(...params, limit, offset).all();
  
  return result.results || [];
}

export async function getSubjectsTaught(db: any): Promise<Array<{slug: string, nameFr: string, nameAr: string | null, count: number}>> {
  const result = await db.prepare(`
    SELECT s.slug, s.nameFr, s.nameAr, COUNT(DISTINCT r.teacherId) as count
    FROM Subject s
    JOIN Resource r ON r.subjectId = s.id
    WHERE r.status = 'PUBLISHED' AND r.teacherId IS NOT NULL
    GROUP BY s.id
    ORDER BY count DESC
    LIMIT 20
  `).all();
  return result.results || [];
}

export async function getClassesTaught(db: any): Promise<Array<{slug: string, nameFr: string, nameAr: string | null, count: number}>> {
  const result = await db.prepare(`
    SELECT c.slug, c.nameFr, c.nameAr, COUNT(DISTINCT r.teacherId) as count
    FROM Class c
    JOIN Resource r ON r.classId = c.id
    WHERE r.status = 'PUBLISHED' AND r.teacherId IS NOT NULL
    GROUP BY c.id
    ORDER BY count DESC
    LIMIT 20
  `).all();
  return result.results || [];
}

export async function getGlobalStats(db: any): Promise<{totalActive: number, totalVerified: number, totalResources: number}> {
  const result = await db.prepare(`
    SELECT 
      (SELECT COUNT(*) FROM User WHERE role = 'TEACHER' AND status = 'ACTIVE') as totalActive,
      (SELECT COUNT(*) FROM User WHERE role = 'TEACHER' AND status = 'ACTIVE' AND isVerifiedTeacher = 1) as totalVerified,
      (SELECT COUNT(*) FROM Resource WHERE status = 'PUBLISHED' AND teacherId IS NOT NULL) as totalResources
  `).first();
  return result || { totalActive: 0, totalVerified: 0, totalResources: 0 };
}

// Additional helpers for profs page

export async function getClassSlugsForTeachers(db: any): Promise<Array<{slug: string, nameFr: string, nameAr: string | null}>> {
  const result = await db.prepare(`
    SELECT DISTINCT c.slug, c.nameFr, c.nameAr
    FROM Class c
    JOIN Resource r ON r.classId = c.id
    WHERE r.status = 'PUBLISHED' AND r.teacherId IS NOT NULL
    ORDER BY c.nameFr
  `).all();
  return result.results || [];
}

export async function getSubjectSlugsForTeachers(db: any, classSlugs: string[] = []): Promise<Array<{slug: string, nameFr: string, nameAr: string | null, color: string | null}>> {
  let classFilter = '';
  const params: any[] = [];
  if (classSlugs.length > 0) {
    const placeholders = classSlugs.map(() => '?').join(',');
    classFilter = `AND r.classId IN (SELECT id FROM Class WHERE slug IN (${placeholders}))`;
    params.push(...classSlugs);
  }
  const result = await db.prepare(`
    SELECT DISTINCT s.slug, s.nameFr, s.nameAr, s.color
    FROM Subject s
    JOIN Resource r ON r.subjectId = s.id
    WHERE r.status = 'PUBLISHED' AND r.teacherId IS NOT NULL ${classFilter}
    ORDER BY s.nameFr
  `).bind(...params).all();
  return result.results || [];
}

export async function getTeacherIdsByResourceGroup(
  db: any, 
  filters: { subjectSlugs?: string[], classSlugs?: string[] }
): Promise<string[]> {
  const conditions = ["r.status = 'PUBLISHED'", "r.teacherId IS NOT NULL"];
  const params: any[] = [];
  
  if (filters.subjectSlugs && filters.subjectSlugs.length > 0) {
    const placeholders = filters.subjectSlugs.map(() => '?').join(',');
    conditions.push(`s.slug IN (${placeholders})`);
    params.push(...filters.subjectSlugs);
  }
  if (filters.classSlugs && filters.classSlugs.length > 0) {
    const placeholders = filters.classSlugs.map(() => '?').join(',');
    conditions.push(`c.slug IN (${placeholders})`);
    params.push(...filters.classSlugs);
  }
  
  const result = await db.prepare(`
    SELECT DISTINCT r.teacherId
    FROM Resource r
    LEFT JOIN Subject s ON r.subjectId = s.id
    LEFT JOIN Class c ON r.classId = c.id
    WHERE ${conditions.join(' AND ')}
  `).bind(...params).all();
  
  return (result.results || []).map((r: any) => r.teacherId).filter(Boolean);
}

export async function getResourceStatsByTeacher(
  db: any,
  teacherIds: string[]
): Promise<Map<string, {downloads: number, recentUploads: number}>> {
  if (teacherIds.length === 0) return new Map();
  
  const placeholders = teacherIds.map(() => '?').join(',');
  const result = await db.prepare(`
    SELECT teacherId, 
           SUM(downloadsCount) as totalDownloads,
           COUNT(*) as resourceCount,
           MAX(publishedAt) as lastPublishedAt
    FROM Resource
    WHERE status = 'PUBLISHED' AND teacherId IN (${placeholders})
    GROUP BY teacherId
  `).bind(...teacherIds).all();
  
  const map = new Map<string, {downloads: number, recentUploads: number}>();
  for (const r of result.results || []) {
    map.set(r.teacherId, {
      downloads: r.totalDownloads || 0,
      recentUploads: r.resourceCount || 0,
    });
  }
  return map;
}

export async function getFollowersByTeacher(
  db: any,
  teacherIds: string[]
): Promise<Map<string, number>> {
  if (teacherIds.length === 0) return new Map();
  
  const placeholders = teacherIds.map(() => '?').join(',');
  const result = await db.prepare(`
    SELECT followingId, COUNT(*) as count
    FROM Follow
    WHERE followingId IN (${placeholders})
    GROUP BY followingId
  `).bind(...teacherIds).all();
  
  const map = new Map<string, number>();
  for (const r of result.results || []) {
    map.set(r.followingId, r.count);
  }
  return map;
}
