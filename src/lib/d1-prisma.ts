// @ts-nocheck
/**
 * D1-based prisma shim.
 * 
 * This is a thin wrapper that exposes the same `prisma.subject.findMany` API
 * but executes via D1 directly. Used to replace the prisma-compat proxy on
 * CF Workers where the import-time getCloudflareContext() race condition
 * was causing 1101 errors.
 * 
 * Only supports the methods used by Examanet pages. For full Prisma support,
 * use the real prisma client on Vercel.
 */

import { getD1, getAllSubjects, getSubjectBySlug, getAllSubjectSlugs, getResourceCountBySubject, getResourceCountsAllSubjects } from './d1-subjects';

// Cache the db instance and the prisma proxy
let _db: any = null;
let _prisma: any = null;

async function getDb() {
  if (_db) return _db;
  _db = await getD1();
  return _db;
}

export async function getPrisma() {
  if (_prisma) return _prisma;
  const db = await getDb();
  
  _prisma = {
    subject: {
      findMany: async (args: any = {}) => {
        const excludeSlugs = args?.where?.slug?.notIn || [];
        const subjects = await getAllSubjects(db, excludeSlugs);
        // Apply select if specified
        if (args?.select) {
          return subjects.map((s: any) => {
            const result: any = {};
            for (const key of Object.keys(args.select)) {
              if (args.select[key] && s[key] !== undefined) {
                result[key] = s[key];
              }
            }
            return result;
          });
        }
        return subjects;
      },
      findUnique: async (args: any) => {
        if (args?.where?.slug) {
          return await getSubjectBySlug(db, args.where.slug);
        }
        return null;
      },
      count: async () => {
        const subjects = await getAllSubjects(db);
        return subjects.length;
      },
    },
    _count: {
      // Direct count helpers
      resourcesBySubject: async (subjectId: string) => {
        return await getResourceCountBySubject(db, subjectId);
      },
    },
  };
  
  return _prisma;
}
