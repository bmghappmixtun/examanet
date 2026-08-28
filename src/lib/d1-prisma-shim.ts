// @ts-nocheck
/**
 * D1-based prisma shim.
 * 
 * Drop-in replacement for `@/lib/prisma` on CF Workers.
 * Same API shape (prisma.user.findMany, prisma.subject.findMany, etc.)
 * but uses D1 directly via getCloudflareContext().
 * 
 * This avoids the race condition with prisma-compat's import-time
 * getCloudflareContext() call.
 * 
 * IMPORTANT: Only supports the methods used by Examanet pages.
 * For other Prisma features, fall back to the real prisma on Vercel.
 */

import { getD1 } from './d1-subjects';

let _db: any = null;
async function db() {
  if (_db) return _db;
  _db = await getD1();
  return _db;
}

// =================== HELPERS ===================

function buildUserWhere(where: any = {}): { sql: string; params: any[] } {
  const conds: string[] = ["role = 'TEACHER'", "status = 'ACTIVE'"];
  const params: any[] = [];
  
  if (where.isVerifiedTeacher) conds.push('isVerifiedTeacher = 1');
  
  if (where.searchTokens && where.searchTokens.length > 0) {
    for (const token of where.searchTokens) {
      const lc = token.toLowerCase();
      const subConds = [
        'LOWER(firstName) LIKE ?',
        'LOWER(lastName) LIKE ?',
        'LOWER(IFNULL(firstNameAr, "")) LIKE ?',
        'LOWER(IFNULL(lastNameAr, "")) LIKE ?',
        'LOWER(IFNULL(schoolName, "")) LIKE ?',
        'LOWER(IFNULL(schoolNameAr, "")) LIKE ?',
        'LOWER(IFNULL(bio, "")) LIKE ?',
        'LOWER(IFNULL(slug, "")) LIKE ?',
      ];
      if (/^\d+$/.test(token)) {
        subConds.push('numericId = ?');
        params.push(parseInt(token, 10));
      }
      conds.push('(' + subConds.join(' OR ') + ')');
      for (let i = 0; i < 8; i++) params.push(`%${lc}%`);
    }
  }
  
  if (where.id?.in) {
    const placeholders = where.id.in.map(() => '?').join(',');
    conds.push(`id IN (${placeholders})`);
    params.push(...where.id.in);
  }
  
  return { sql: conds.join(' AND '), params };
}

const USER_FIELDS = `
  id, numericId, slug, firstName, lastName, firstNameAr, lastNameAr, avatarUrl,
  bio, phone, website, schoolLevel, classLevel, schoolName, schoolNameAr,
  governorate, teachingSubjects, teachingLevels, cvUrl, diploma,
  isVerifiedTeacher, approvedAt, approvedById, uploadsCount, followersCount, createdAt, updatedAt
`;

// =================== PRISMA ===================

export const prisma = {
  user: {
    async count({ where = {} }: any = {}) {
      const d = await db();
      const { sql, params } = buildUserWhere(where);
      const result = await d.prepare(`SELECT COUNT(*) as count FROM User WHERE ${sql}`).bind(...params).first();
      return result?.count || 0;
    },
    
    async findMany({ where = {}, orderBy, take, skip, select }: any = {}) {
      const d = await db();
      const { sql, params } = buildUserWhere(where);
      
      // Build order by
      let orderBySql = 'firstName ASC';
      if (orderBy) {
        if (Array.isArray(orderBy)) {
          orderBySql = orderBy.map((o: any) => `${Object.keys(o)[0]} ${Object.values(o)[0]}`).join(', ');
        } else {
          orderBySql = `${Object.keys(orderBy)[0]} ${Object.values(orderBy)[0]}`;
        }
      }
      
      let query = `SELECT ${select ? buildSelectClause(select, USER_FIELDS) : USER_FIELDS} FROM User WHERE ${sql} ORDER BY ${orderBySql}`;
      if (take) { query += ' LIMIT ?'; params.push(take); }
      if (skip) { query += ' OFFSET ?'; params.push(skip); }
      
      const result = await d.prepare(query).bind(...params).all();
      return result.results || [];
    },
    
    async findUnique({ where, select }: any) {
      const d = await db();
      let conds = '';
      const params: any[] = [];
      if (where.id) { conds = 'id = ?'; params.push(where.id); }
      else if (where.numericId) { conds = 'numericId = ?'; params.push(where.numericId); }
      else if (where.slug) { conds = 'slug = ?'; params.push(where.slug); }
      else if (where.email) { conds = 'email = ?'; params.push(where.email); }
      else return null;
      
      let query = `SELECT ${select ? buildSelectClause(select, USER_FIELDS) : USER_FIELDS} FROM User WHERE ${conds} LIMIT 1`;
      const result = await d.prepare(query).bind(...params).first();
      return result;
    },
  },
  
  subject: {
    async findMany({ where = {}, orderBy, take, skip, select, include }: any = {}) {
      const d = await db();
      const conds: string[] = [];
      const params: any[] = [];
      
      if (where.slug) {
        if (where.slug.in) {
          const placeholders = where.slug.in.map(() => '?').join(',');
          conds.push(`slug IN (${placeholders})`);
          params.push(...where.slug.in);
        }
        if (where.slug.notIn) {
          const placeholders = where.slug.notIn.map(() => '?').join(',');
          conds.push(`slug NOT IN (${placeholders})`);
          params.push(...where.slug.notIn);
        }
        if (where.slug.not) conds.push('slug != ?'), params.push(where.slug.not);
      }
      
      if (where.resources?.some) {
        const some = where.resources.some;
        const someConds = [];
        const someParams = [];
        if (some.status) { someConds.push('status = ?'); someParams.push(some.status); }
        if (some.teacherId?.not === null) { someConds.push('teacherId IS NOT NULL'); }
        if (some.class?.slug?.in) {
          const placeholders = some.class.slug.in.map(() => '?').join(',');
          someConds.push(`classId IN (SELECT id FROM Class WHERE slug IN (${placeholders}))`);
          someParams.push(...some.class.slug.in);
        }
        if (some.subject?.slug?.in) {
          const placeholders = some.subject.slug.in.map(() => '?').join(',');
          someConds.push(`subjectId IN (SELECT id FROM Subject WHERE slug IN (${placeholders}))`);
          someParams.push(...some.subject.slug.in);
        }
        if (someConds.length > 0) {
          conds.push(`id IN (SELECT DISTINCT subjectId FROM Resource WHERE ${someConds.join(' AND ')})`);
          params.push(...someParams);
        }
      }
      
      let orderBySql = '"order" ASC';
      if (orderBy?.nameFr) orderBySql = `nameFr ${orderBy.nameFr}`;
      if (orderBy?.order) orderBySql = `"order" ${orderBy.order}`;
      
      const selectClause = select 
        ? buildSelectClause(select, 'id, numericId, slug, nameFr, nameAr, color, icon, "order", createdAt, updatedAt')
        : 'id, numericId, slug, nameFr, nameAr, color, icon, "order", createdAt, updatedAt';
      
      let query = `SELECT ${selectClause} FROM Subject WHERE ${conds.length ? conds.join(' AND ') : '1=1'} ORDER BY ${orderBySql}`;
      if (take) { query += ' LIMIT ?'; params.push(take); }
      if (skip) { query += ' OFFSET ?'; params.push(skip); }
      
      const result = await d.prepare(query).bind(...params).all();
      let subjects = result.results || [];
      
      // Handle include._count.resources
      if (include?._count?.select?.resources) {
        const countResult = await d.prepare(`
          SELECT subjectId, COUNT(*) as count FROM Resource 
          WHERE status = 'PUBLISHED' AND subjectId IS NOT NULL
          GROUP BY subjectId
        `).all();
        const countMap = new Map<string, number>();
        for (const r of countResult.results || []) countMap.set(r.subjectId, r.count);
        subjects = subjects.map((s: any) => ({ ...s, _count: { resources: countMap.get(s.id) || 0 } }));
      }
      
      return subjects;
    },
    
    async findUnique({ where, select, include }: any) {
      const d = await db();
      let conds = '';
      const params: any[] = [];
      if (where.id) { conds = 'id = ?'; params.push(where.id); }
      else if (where.numericId) { conds = 'numericId = ?'; params.push(where.numericId); }
      else if (where.slug) { conds = 'slug = ?'; params.push(where.slug); }
      else return null;
      
      const selectClause = select 
        ? buildSelectClause(select, 'id, numericId, slug, nameFr, nameAr, color, icon, "order", createdAt, updatedAt')
        : 'id, numericId, slug, nameFr, nameAr, color, icon, "order", createdAt, updatedAt';
      
      const result = await d.prepare(`SELECT ${selectClause} FROM Subject WHERE ${conds} LIMIT 1`).bind(...params).first();
      
      if (result && include?._count?.select?.resources) {
        const count = await d.prepare(`
          SELECT COUNT(*) as count FROM Resource 
          WHERE subjectId = ? AND status = 'PUBLISHED'
        `).bind(result.id).first();
        (result as any)._count = { resources: count?.count || 0 };
      }
      
      return result;
    },
  },
  
  class: {
    async findMany({ where = {}, orderBy, take, skip, select }: any = {}) {
      const d = await db();
      const conds: string[] = [];
      const params: any[] = [];
      
      if (where.slug?.in) {
        const placeholders = where.slug.in.map(() => '?').join(',');
        conds.push(`slug IN (${placeholders})`);
        params.push(...where.slug.in);
      }
      if (where.OR) {
        const orConds: string[] = [];
        for (const cond of where.OR) {
          if (cond.slug) { orConds.push('slug = ?'); params.push(cond.slug); }
          if (cond.nameFr?.contains) { orConds.push('nameFr LIKE ?'); params.push(`%${cond.nameFr.contains}%`); }
        }
        if (orConds.length) conds.push('(' + orConds.join(' OR ') + ')');
      }
      
      let orderBySql = 'nameFr ASC';
      if (orderBy?.nameFr) orderBySql = `nameFr ${orderBy.nameFr}`;
      
      const selectClause = select 
        ? buildSelectClause(select, 'id, numericId, slug, nameFr, nameAr, levelId, "order"')
        : 'id, numericId, slug, nameFr, nameAr, levelId, "order"';
      
      let query = `SELECT ${selectClause} FROM Class WHERE ${conds.length ? conds.join(' AND ') : '1=1'} ORDER BY ${orderBySql}`;
      if (take) { query += ' LIMIT ?'; params.push(take); }
      if (skip) { query += ' OFFSET ?'; params.push(skip); }
      
      const result = await d.prepare(query).bind(...params).all();
      
      if (where.resources?.some) {
        const some = where.resources.some;
        const someConds = [];
        const someParams = [];
        if (some.status) { someConds.push('status = ?'); someParams.push(some.status); }
        if (some.teacherId?.not === null) { someConds.push('teacherId IS NOT NULL'); }
        if (some.subject?.slug?.in) {
          const placeholders = some.subject.slug.in.map(() => '?').join(',');
          someConds.push(`subjectId IN (SELECT id FROM Subject WHERE slug IN (${placeholders}))`);
          someParams.push(...some.subject.slug.in);
        }
        if (someConds.length > 0) {
          conds.push(`id IN (SELECT DISTINCT classId FROM Resource WHERE ${someConds.join(' AND ')})`);
          params.push(...someParams);
        }
      }
      
      return result.results || [];
    },
    
    async findFirst({ where = {}, select }: any) {
      const d = await db();
      const conds: string[] = [];
      const params: any[] = [];
      
      if (where.OR) {
        const orConds: string[] = [];
        for (const cond of where.OR) {
          if (cond.slug) { orConds.push('slug = ?'); params.push(cond.slug); }
          if (cond.nameFr?.contains) { orConds.push('nameFr LIKE ?'); params.push(`%${cond.nameFr.contains}%`); }
        }
        if (orConds.length) conds.push('(' + orConds.join(' OR ') + ')');
      }
      
      const selectClause = select 
        ? buildSelectClause(select, 'id, numericId, slug, nameFr, nameAr, levelId')
        : 'id, numericId, slug, nameFr, nameAr, levelId';
      
      const result = await d.prepare(`
        SELECT ${selectClause} FROM Class 
        WHERE ${conds.length ? conds.join(' AND ') : '1=1'} 
        LIMIT 1
      `).bind(...params).first();
      return result;
    },
  },
  
  section: {
    async findFirst({ where = {}, select }: any) {
      const d = await db();
      let conds = '';
      const params: any[] = [];
      if (where.slug) { conds = 'slug = ?'; params.push(where.slug); }
      else return null;
      
      const selectClause = select 
        ? buildSelectClause(select, 'id, slug, nameFr, nameAr')
        : 'id, slug, nameFr, nameAr';
      
      const result = await d.prepare(`
        SELECT ${selectClause} FROM Section WHERE ${conds} LIMIT 1
      `).bind(...params).first();
      return result;
    },
    
    async findMany({ where = {}, select }: any = {}) {
      const d = await db();
      const conds: string[] = [];
      const params: any[] = [];
      if (where.slug?.in) {
        const placeholders = where.slug.in.map(() => '?').join(',');
        conds.push(`slug IN (${placeholders})`);
        params.push(...where.slug.in);
      }
      
      const selectClause = select 
        ? buildSelectClause(select, 'id, slug, nameFr, nameAr')
        : 'id, slug, nameFr, nameAr';
      
      const result = await d.prepare(`
        SELECT ${selectClause} FROM Section 
        WHERE ${conds.length ? conds.join(' AND ') : '1=1'} 
        ORDER BY nameFr
      `).bind(...params).all();
      return result.results || [];
    },
  },
  
  resource: {
    async count({ where = {} }: any = {}) {
      const d = await db();
      const { sql, params } = buildResourceWhere(where);
      const result = await d.prepare(`SELECT COUNT(*) as count FROM Resource WHERE ${sql}`).bind(...params).first();
      return result?.count || 0;
    },
    
    async findMany({ where = {}, orderBy, take, skip, select }: any = {}) {
      const d = await db();
      const { sql, params } = buildResourceWhere(where);
      
      const selectClause = select 
        ? buildSelectClause(select, 'id, numericId, slug, title, type, status, subjectId, classId, sectionId, teacherId, year, trimester, schoolType, hasCorrection, isFeatured, viewsCount, downloadsCount, avgRating, ratingsCount, commentsCount, favoritesCount, publishedAt, createdAt, updatedAt, fileKey, fileUrl, fileSize, pageCount, thumbnailKey, thumbnailUrl, tags, language, headerData, schoolName, teacherNameAr, homeworkSubtype, homeworkNumber, description, summary')
        : 'id, numericId, slug, title, type, status, subjectId, classId, sectionId, teacherId, year, trimester, schoolType, hasCorrection, isFeatured, viewsCount, downloadsCount, avgRating, ratingsCount, commentsCount, favoritesCount, publishedAt, createdAt, updatedAt';
      
      let orderBySql = 'publishedAt DESC';
      if (orderBy) {
        if (Array.isArray(orderBy)) {
          orderBySql = orderBy.map((o: any) => `${Object.keys(o)[0]} ${Object.values(o)[0]}`).join(', ');
        } else {
          orderBySql = `${Object.keys(orderBy)[0]} ${Object.values(orderBy)[0]}`;
        }
      }
      
      let query = `SELECT ${selectClause} FROM Resource WHERE ${sql} ORDER BY ${orderBySql}`;
      if (take) { query += ' LIMIT ?'; params.push(take); }
      if (skip) { query += ' OFFSET ?'; params.push(skip); }
      
      const result = await d.prepare(query).bind(...params).all();
      return result.results || [];
    },
    
    async groupBy({ by, where = {}, _count, _sum, _avg }: any) {
      const d = await db();
      const { sql, params } = buildResourceWhere(where);
      
      const groupCols = by.join(', ');
      const selectParts: string[] = [groupCols];
      
      if (_count) {
        if (_count._all) selectParts.push('COUNT(*) as count');
        else {
          for (const k of Object.keys(_count)) selectParts.push(`COUNT(${k}) as count`);
        }
      }
      if (_sum) {
        for (const k of Object.keys(_sum)) selectParts.push(`SUM(${k}) as sum_${k}`);
      }
      if (_avg) {
        for (const k of Object.keys(_avg)) selectParts.push(`AVG(${k}) as avg_${k}`);
      }
      
      const result = await d.prepare(`
        SELECT ${selectParts.join(', ')} 
        FROM Resource 
        WHERE ${sql} 
        GROUP BY ${groupCols}
      `).bind(...params).all();
      
      return (result.results || []).map((row: any) => {
        const obj: any = { ...row };
        // Reformat to match prisma's groupBy output
        if (_count) {
          if (_count._all) {
            obj._count = { _all: row.count };
          } else {
            obj._count = {};
            for (const k of Object.keys(_count)) obj._count[k] = row.count;
          }
        }
        if (_sum) {
          obj._sum = {};
          for (const k of Object.keys(_sum)) obj._sum[k] = row[`sum_${k}`] || 0;
        }
        if (_avg) {
          obj._avg = {};
          for (const k of Object.keys(_avg)) obj._avg[k] = row[`avg_${k}`] || 0;
        }
        return obj;
      });
    },
  },
  
  download: {
    async groupBy({ by, where = {}, _count }: any) {
      const d = await db();
      const conds: string[] = [];
      const params: any[] = [];
      
      if (where.resource?.teacherId?.in) {
        const placeholders = where.resource.teacherId.in.map(() => '?').join(',');
        conds.push(`resourceId IN (SELECT id FROM Resource WHERE teacherId IN (${placeholders}) AND status = 'PUBLISHED')`);
        params.push(...where.resource.teacherId.in);
      }
      if (where.resource?.status) {
        // Already in the subquery above
      }
      
      const groupCols = by.join(', ');
      const result = await d.prepare(`
        SELECT ${groupCols}, COUNT(*) as count 
        FROM Download 
        WHERE ${conds.length ? conds.join(' AND ') : '1=1'} 
        GROUP BY ${groupCols}
      `).bind(...params).all();
      
      return (result.results || []).map((row: any) => ({
        ...row,
        _count: { _all: row.count },
      }));
    },
  },
  
  follow: {
    async groupBy({ by, where = {}, _count }: any) {
      const d = await db();
      const conds: string[] = [];
      const params: any[] = [];
      
      if (where.followingId?.in) {
        const placeholders = where.followingId.in.map(() => '?').join(',');
        conds.push(`followingId IN (${placeholders})`);
        params.push(...where.followingId.in);
      }
      
      const groupCols = by.join(', ');
      const result = await d.prepare(`
        SELECT ${groupCols}, COUNT(*) as count 
        FROM Follow 
        WHERE ${conds.length ? conds.join(' AND ') : '1=1'} 
        GROUP BY ${groupCols}
      `).bind(...params).all();
      
      return (result.results || []).map((row: any) => ({
        ...row,
        _count: { _all: row.count },
      }));
    },
  },
  
  $transaction: async (queries: any[]) => {
    return await Promise.all(queries);
  },
};

function buildResourceWhere(where: any = {}): { sql: string; params: any[] } {
  const conds: string[] = [];
  const params: any[] = [];
  
  if (where.subjectId) {
    conds.push('subjectId = ?');
    params.push(where.subjectId);
  }
  if (where.status) {
    conds.push('status = ?');
    params.push(where.status);
  }
  if (where.type) {
    conds.push('type = ?');
    params.push(where.type);
  }
  if (where.teacherId) {
    if (where.teacherId.not === null) conds.push('teacherId IS NOT NULL');
    else if (where.teacherId.in) {
      const placeholders = where.teacherId.in.map(() => '?').join(',');
      conds.push(`teacherId IN (${placeholders})`);
      params.push(...where.teacherId.in);
    }
  }
  if (where.trimester) {
    conds.push('trimester = ?');
    params.push(where.trimester);
  }
  if (where.subject?.slug?.in) {
    const placeholders = where.subject.slug.in.map(() => '?').join(',');
    conds.push(`subjectId IN (SELECT id FROM Subject WHERE slug IN (${placeholders}))`);
    params.push(...where.subject.slug.in);
  }
  if (where.class?.slug?.in) {
    const placeholders = where.class.slug.in.map(() => '?').join(',');
    conds.push(`classId IN (SELECT id FROM Class WHERE slug IN (${placeholders}))`);
    params.push(...where.class.slug.in);
  }
  
  return { 
    sql: conds.length ? conds.join(' AND ') : '1=1',
    params 
  };
}

function buildSelectClause(select: any, allFields: string): string {
  if (select === true) return allFields;
  if (select && typeof select === 'object') {
    const fields = Object.keys(select).filter(k => select[k]);
    if (fields.length === 0) return allFields;
    return fields.join(', ');
  }
  return allFields;
}
