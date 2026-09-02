// @ts-nocheck
// D1 Drizzle client for Cloudflare Workers
// Phase 1 of Neon → D1 migration
//
// Usage in a route:
//   import { getD1Db } from '@/lib/db/d1-client';
//   const db = await getD1Db();
//   const rows = await db.select().from(resources).limit(10);
//
// The DB binding is read from the CF Workers context
// (provided by @opennextjs/cloudflare).

import { drizzle, type DrizzleD1Database } from 'drizzle-orm/d1';
import { schema } from './schema-d1';

export type DB = DrizzleD1Database<typeof schema>;

/**
 * Get the Drizzle D1 client.
 *
 * MUST be called inside a request handler, NOT at module load time.
 * (Same pattern as the existing `getDb()` in db/index.ts.)
 */
export async function getD1Db(env?: any): Promise<DB> {
  // If env is passed (e.g., from getCloudflareContext), use it directly.
  // Otherwise, fetch from CF context.
  let d1: D1Database;
  if (env?.DB) {
    d1 = env.DB;
  } else {
    const { getCloudflareContext } = await import('@opennextjs/cloudflare');
    const ctx = await getCloudflareContext({ async: true });
    d1 = (ctx as any).env.DB;
  }
  if (!d1) {
    throw new Error('D1 binding "DB" not available in worker context');
  }
  return drizzle(d1, { schema });
}
