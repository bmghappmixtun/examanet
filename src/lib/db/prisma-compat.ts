// @ts-nocheck
// STUB Prisma-compatible proxy for CF Workers
// 2026-09-02: Replaced Hyperdrive/Postgres connection with a stub
// because Hyperdrive pointed to Neon DB that has no real data.
// 
// This stub returns empty/null for all Prisma methods.
// Admin actions that need real data should be done on Vercel.
//
// For user-facing features, we use direct D1 queries via:
//   import { getCloudflareContext } from '@opennextjs/cloudflare'
//   const db = (ctx as any).env.DB;
//   await db.prepare('SELECT ...').bind(...).all()

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
        if (prop === 'create' || prop === 'createMany' || prop === 'upsert' ||
            prop === 'update' || prop === 'updateMany' || prop === 'delete' ||
            prop === 'deleteMany') {
          return (args?: any) => Promise.resolve({ id: null, ...args?.data });
        }
        if (prop === 'groupBy' || prop === 'aggregate') {
          return (args?: any) => Promise.resolve([]);
        }
        if (prop === '$queryRaw' || prop === '$queryRawUnsafe' || 
            prop === '$executeRaw' || prop === '$executeRawUnsafe') {
          return () => Promise.resolve([]);
        }
        // Nested model access (e.g., prisma.user.profile)
        if (prop === 'createNested') {
          return () => Promise.resolve({});
        }
        // Unknown - return undefined
        return undefined;
      }
      return undefined;
    },
  });
}

const modelCache: Record<string, any> = {};

// The prisma proxy
const prisma: any = new Proxy({}, {
  get(target, prop) {
    if (typeof prop === 'string') {
      // $transaction, $disconnect, etc.
      if (prop.startsWith('$')) {
        if (prop === '$transaction') {
          return (fn: any) => Promise.resolve([]);
        }
        if (prop === '$disconnect' || prop === '$connect') {
          return () => Promise.resolve();
        }
        return () => Promise.resolve();
      }
      // Model name
      if (!modelCache[prop]) {
        modelCache[prop] = makeModelProxy(prop);
      }
      return modelCache[prop];
    }
    return undefined;
  },
});

export { prisma };
export const getDb = () => Promise.resolve(null);
export const getPrisma = () => Promise.resolve(null);
export type PrismaClient = any;
