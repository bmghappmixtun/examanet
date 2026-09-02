// @ts-nocheck
import { getCurrentUser } from './auth';
import { prisma } from './prisma';

/**
 * Get the set of resource IDs that the current user has favorited.
 * Returns empty Set if not logged in.
 */
export async function getUserFavorites(resourceIds: string[]): Promise<Set<string>> {
  const user = await getCurrentUser();
  if (!user || resourceIds.length === 0) return new Set();
  const favs = await prisma.favorite.findMany({
    where: { userId: user.id, resourceId: { in: resourceIds } },
    select: { resourceId: true },
  });
  return new Set(favs.map((f) => f.resourceId));
}

/**
 * Decorate a list of resources with isFavorited flag based on current user.
 */
export function decorateWithFavorites<T extends { id: string }>(
  resources: T[],
  favoriteIds: Set<string>,
): (T & { isFavorited: boolean })[] {
  return resources.map((r) => ({
    ...r,
    isFavorited: favoriteIds.has(r.id),
  }));
}
