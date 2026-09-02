// @ts-nocheck
// Health check helper - isolated to allow /api/health to skip on Cloudflare Workers
// (where Prisma 5.x binary engine still tries to load even with driver adapter).
import { prisma } from '@/lib/prisma';

export async function checkDbHealth() {
  const start = Date.now();
  await prisma.resource.count({ take: 1 });
  return { dbLatency: Date.now() - start };
}
