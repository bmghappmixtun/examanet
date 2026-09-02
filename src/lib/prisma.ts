// Cloudflare Workers Prisma-compatible proxy — Drizzle ORM backed
// ISOLATED BRANCH: feature/cf-isolated
import 'server-only';
export { prisma } from './db/prisma-compat';
export type { PrismaClient } from './db/prisma-compat';
export { getPrisma } from './db/prisma-compat';
