// @ts-nocheck
/**
 * Cache for `Class.id` indexed by `Level.slug`.
 *
 * 2026-09-02: Migrated from Prisma+Hyperdrive to D1 direct.
 *
 * Class → Level is a static schema relationship (1 lycée level + 1 collège
 * level). The mapping rarely changes, so we cache it in module scope and
 * revalidate every 5 minutes to pick up schema edits.
 *
 * PERF: Pre-resolving to `classId IN [...]` is ~2x faster than JOIN.
 */

type LevelClassIds = {
  college: string[];
  lycee: string[];
  primary: string[];
  all: string[];
};

let cache: { data: LevelClassIds; ts: number } | null = null;
const CACHE_TTL_MS = 5 * 60 * 1000;

async function getD1() {
  const { getCloudflareContext } = await import('@opennextjs/cloudflare');
  const ctx = await getCloudflareContext({ async: true });
  return (ctx as any).env?.DB;
}

export async function getLevelClassIds(): Promise<LevelClassIds> {
  if (cache && Date.now() - cache.ts < CACHE_TTL_MS) {
    return cache.data;
  }

  const db = await getD1();
  if (!db) {
    return { college: [], lycee: [], primary: [], all: [] };
  }

  const levels: any = await db.prepare("SELECT id, slug FROM Level").all();
  const classes: any = await db.prepare("SELECT id, levelId FROM Class").all();
  const levelRows = levels?.results || [];
  const classRows = classes?.results || [];

  const levelIdBySlug = new Map(levelRows.map((l: any) => [l.slug, l.id]));

  const data: LevelClassIds = {
    college: [],
    lycee: [],
    primary: [],
    all: [],
  };

  const collegeLevelId = levelIdBySlug.get('college');
  const lyceeLevelId = levelIdBySlug.get('lycee');
  const primaryLevelId = levelIdBySlug.get('primary');

  for (const c of classRows) {
    data.all.push(c.id);
    if (collegeLevelId && c.levelId === collegeLevelId) data.college.push(c.id);
    else if (lyceeLevelId && c.levelId === lyceeLevelId) data.lycee.push(c.id);
    else if (primaryLevelId && c.levelId === primaryLevelId) data.primary.push(c.id);
  }

  cache = { data, ts: Date.now() };
  return data;
}
