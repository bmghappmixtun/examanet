// @ts-nocheck
/**
 * D1 helpers for admin pages.
 *
 * 2026-08-30: Converted from prisma-compat to raw D1 SQL because prisma-compat
 * hits Neon (Hyperdrive) which has no user/catalog data.
 */
import { getCloudflareContext } from '@opennextjs/cloudflare';

export async function getD1() {
  const ctx = await getCloudflareContext({ async: true });
  return (ctx as any).env.DB;
}

function genId() {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 25);
}

/**
 * Get the next available numericId for a User.
 * 2026-09-06: Added because some users (created via admin invite or
 * self-registration) had numericId=NULL, which broke URLs like
 * /professeurs/null/slug. Call this when creating a new User.
 */
export async function getNextUserNumericId(): Promise<number> {
  try {
    const db = await getD1();
    const r: any = await db
      .prepare('SELECT COALESCE(MAX(numericId), 0) + 1 AS next FROM User')
      .first();
    return Number(r?.next || 1);
  } catch {
    // Fallback: timestamp-based id (rare collision, but safe)
    return Date.now();
  }
}

/** Run a SELECT and return all rows. Returns [] on error. */
export async function d1All(sql: string, ...params: any[]): Promise<any[]> {
  try {
    const db = await getD1();
    const stmt = db.prepare(sql);
    const r = await (params.length ? stmt.bind(...params) : stmt).all();
    return r?.results || [];
  } catch (e: any) {
    console.error('[d1] all failed:', sql.slice(0, 60), e.message);
    return [];
  }
}

/** Run a SELECT and return the first row (or null). */
export async function d1First(sql: string, ...params: any[]): Promise<any | null> {
  try {
    const db = await getD1();
    const stmt = db.prepare(sql);
    const r = await (params.length ? stmt.bind(...params) : stmt).first();
    return r;
  } catch (e: any) {
    console.error('[d1] first failed:', sql.slice(0, 60), e.message);
    return null;
  }
}

/** Run a write statement (INSERT/UPDATE/DELETE). Returns the meta. */
export async function d1Run(sql: string, ...params: any[]): Promise<{ success: boolean; meta?: any; error?: string }> {
  try {
    const db = await getD1();
    const stmt = db.prepare(sql);
    const r = await (params.length ? stmt.bind(...params) : stmt).run();
    return { success: true, meta: r?.meta };
  } catch (e: any) {
    console.error('[d1] run failed:', sql.slice(0, 60), e.message);
    return { success: false, error: e.message };
  }
}

export { genId };
