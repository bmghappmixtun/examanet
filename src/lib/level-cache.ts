// @ts-nocheck
/**
 * Cache for `Class.id` indexed by `Level.slug`.
 *
 * Class → Level is a static schema relationship (1 lycée level + 1 collège
 * level, ~4 lycée classes + ~9 collège classes). The mapping never changes
 * during a deploy lifetime, so we cache it in module scope and revalidate
 * every 5 minutes to pick up schema edits.
 *
 * PERF 2026-08-09: the previous /ressources page used
 * `where.OR = [{ class: { level: { slug: 'lycee' } }, ... }, ...]`
 * which forces Postgres to JOIN Resource→Class→Level on every row.
 * Pre-resolving to `classId IN [...]` is ~2x faster (570ms → 290ms in
 * the dev DB).
 */

import { prisma } from '@/lib/prisma';

type LevelClassIds = {
  college: string[];
  lycee: string[];
  primary: string[]; // unused but kept for completeness
  all: string[];
};

let cache: { data: LevelClassIds; ts: number } | null = null;
const CACHE_TTL_MS = 5 * 60 * 1000;

export async function getLevelClassIds(): Promise<LevelClassIds> {
  if (cache && Date.now() - cache.ts < CACHE_TTL_MS) {
    return cache.data;
  }

  const allLevels = await prisma.level.findMany({ select: { id: true, slug: true } });
  const allClasses = await prisma.class.findMany({
    select: { id: true, levelId: true },
  });
  const levelIdBySlug = new Map(allLevels.map((l) => [l.slug, l.id]));

  const data: LevelClassIds = {
    college: [],
    lycee: [],
    primary: [],
    all: [],
  };

  const collegeLevelId = levelIdBySlug.get('college');
  const lyceeLevelId = levelIdBySlug.get('lycee');
  const primaryLevelId = levelIdBySlug.get('primary');

  for (const c of allClasses) {
    data.all.push(c.id);
    if (collegeLevelId && c.levelId === collegeLevelId) data.college.push(c.id);
    else if (lyceeLevelId && c.levelId === lyceeLevelId) data.lycee.push(c.id);
    else if (primaryLevelId && c.levelId === primaryLevelId) data.primary.push(c.id);
  }

  cache = { data, ts: Date.now() };
  return data;
}
