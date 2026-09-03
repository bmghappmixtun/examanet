// @ts-nocheck
/**
 * STUB Prisma-compatible proxy for CF Workers.
 *
 * 2026-09-03: Final cleanup of Phase 8 Prisma+Hyperdrive → D1 migration.
 * - All user-facing features have been migrated to direct D1 queries.
 * - Admin features (43+ admin routes, 1 lib file) still use this stub
 *   because admin uses Vercel (which has real Prisma+Neon data).
 * - On CF Workers, this stub returns empty arrays/null. Admin pages
 *   will appear empty on Cloudflare domain — this is by design.
 *
 * If you need real data on CF Workers, migrate the calling code to
 * use D1 direct:
 *   import { getCloudflareContext } from '@opennextjs/cloudflare'
 *   const db = (ctx as any).env.DB;
 *   await db.prepare('SELECT ...').bind(...).all()
 *
 * DEPRECATED: 2026-09-03. New code MUST use D1 direct, not this stub.
 */

type WhereInput = Record<string, any>;

const emptyArray: any[] = [];
const emptyObject: any = {};

// Empty query result
function emptyResult() {
  return Promise.resolve([]);
}

function emptyCount() {
  return Promise.resolve(0);
}

function emptyFirst() {
  return Promise.resolve(null);
}

// Make a model proxy that returns empty for any method
function makeModelProxy(modelName: string): any {
  return new Proxy({}, {
    get(target, prop) {
      if (typeof prop === 'string') {
        // Common methods - return empty data
        if (prop === 'findMany' || prop === 'findFirst' || prop === 'findUnique' || 
            prop === 'findFirstOrThrow' || prop === 'findUniqueOrThrow') {
          return (args?: any) => emptyResult();
        }
        if (prop === 'count') {
          return (args?: any) => emptyCount();
        }
        if (prop === 'findFirst' || prop === 'findUnique') {
          return (args?: any) => emptyFirst();
        }
        if (prop === 'groupBy' || prop === 'aggregate') {
          return (args?: any) => Promise.resolve([]);
        }
        // Mutations
        if (prop === 'create' || prop === 'createMany' || prop === 'update' || 
            prop === 'updateMany' || prop === 'upsert' || prop === 'delete' || 
            prop === 'deleteMany' || prop === 'increment' || prop === 'decrement' ||
            prop === 'connect' || prop === 'disconnect') {
          if (modelName === 'user' && prop === 'create') {
            console.warn('[prisma-compat STUB] user.create called on CF Workers — admin features need Vercel');
          }
          return (args?: any) => emptyFirst();
        }
        // Count helpers like _count.resources
        if (prop.startsWith('_')) {
          return new Proxy({}, { get: () => (args?: any) => emptyCount() });
        }
        // Default: return proxy for nested includes
        return new Proxy({}, { get: () => (args?: any) => emptyResult() });
      }
      return undefined;
    },
  });
}

// Top-level proxy: $transaction, $queryRaw, etc.
const prisma = new Proxy({}, {
  get(target, prop) {
    if (typeof prop === 'string') {
      if (prop === '$transaction') {
        return (fn: any) => Promise.resolve([]);
      }
      if (prop === '$queryRaw' || prop === '$executeRaw') {
        return () => Promise.resolve([]);
      }
      if (prop === '$connect' || prop === '$disconnect') {
        return () => Promise.resolve();
      }
      // All other access returns a model proxy
      return makeModelProxy(prop);
    }
    return undefined;
  },
});

export { prisma };
export const getDb = () => Promise.resolve(null);
export const getPrisma = () => Promise.resolve(prisma);
export type PrismaClient = any;
