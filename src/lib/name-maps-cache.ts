// @ts-nocheck
/**
 * Cached lookup of the full Class / Section / Subject list.
 *
 * Used by the /ressources page to build display name maps (e.g. showing
 * "Sciences expérimentales" instead of "sciences" in the filter chips).
 * The data is static at runtime — only an admin schema edit would change
 * it — so we cache it in module scope for 5 minutes.
 *
 * PERF 2026-08-09: previously the page did `prisma.class.findMany()`,
 * `prisma.section.findMany()`, `prisma.subject.findMany()` on every
 * request just to render the slug→name map (3 unnecessary full-table
 * scans × 200ms network = ~600ms wasted). Now those are served from
 * memory in O(1).
 */

import { prisma } from '@/lib/prisma';

type NameMap = { slug: string; nameFr: string };
type NameMaps = {
  allClasses: NameMap[];
  allSections: NameMap[];
  allSubjects: NameMap[];
};

let cache: { data: NameMaps; ts: number } | null = null;
const CACHE_TTL_MS = 5 * 60 * 1000;

export async function getNameMapsCached(): Promise<NameMaps> {
  if (cache && Date.now() - cache.ts < CACHE_TTL_MS) {
    return cache.data;
  }
  const [allClasses, allSections, allSubjects] = await Promise.all([
    prisma.class.findMany({ select: { slug: true, nameFr: true } }),
    prisma.section.findMany({ select: { slug: true, nameFr: true } }),
    prisma.subject.findMany({ select: { slug: true, nameFr: true } }),
  ]);
  const data = { allClasses, allSections, allSubjects };
  cache = { data, ts: Date.now() };
  return data;
}
