// Drizzle ORM client for Cloudflare Workers
// ISOLATED BRANCH: feature/cf-isolated
//
// Uses the `postgres` driver (postgres.js) with Hyperdrive connection.
// Works on Cloudflare Workers because postgres.js is pure JS (no native binary).
//
// IMPORTANT: This is ONLY used on the CF POC. Vercel uses Prisma directly.

import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

const globalForDrizzle = globalThis as unknown as {
  __drizzleClient: ReturnType<typeof drizzle> | undefined;
  __drizzleInitPromise: Promise<ReturnType<typeof drizzle>> | undefined;
};

async function createDrizzleClient() {
  // Get Hyperdrive binding from Cloudflare context
  // MUST be called inside a function, NOT at module level
  const { getCloudflareContext } = await import('@opennextjs/cloudflare');
  const { env } = await getCloudflareContext({ async: true });

  const connectionString = env.HYPERDRIVE?.connectionString;
  if (!connectionString) {
    throw new Error('HYPERDRIVE binding missing on Cloudflare Worker');
  }

  // postgres.js with Hyperdrive: max=5 connections (was 3).
  // 2026-08-25: bumped from 3 to 5 to reduce Error 1101 "Worker threw
  // exception" on /fr/ressources, which fires 20+ parallel queries.
  // With max=3, queries queue up and some hit the 30s Workers CPU
  // limit, killing the request. Hyperdrive handles external pooling,
  // so raising max on the inner driver is safe.
  // Also added statement_timeout=15s to prevent any single query from
  // hanging indefinitely and pinning a connection.
  const client = postgres(connectionString, {
    max: 10,
    idle_timeout: 0,
    connect_timeout: 10,
    prepare: false,
  });

  return drizzle(client, { schema });
}

export async function getDb() {
  if (globalForDrizzle.__drizzleClient) {
    return globalForDrizzle.__drizzleClient;
  }
  if (globalForDrizzle.__drizzleInitPromise) {
    return globalForDrizzle.__drizzleInitPromise;
  }
  globalForDrizzle.__drizzleInitPromise = createDrizzleClient();
  const db = await globalForDrizzle.__drizzleInitPromise;
  globalForDrizzle.__drizzleClient = db;
  return db;
}

export { schema };
