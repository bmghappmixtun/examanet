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
