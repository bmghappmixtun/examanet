/**
 * Tunisian curriculum level helpers.
 *
 * Single source of truth for "is this class collège or lycée?".
 * Uses the existing Level table (slug: 'college' | 'lycee') that is
 * already linked to Class via Class.levelId.
 *
 * Prefer this over hardcoded `c.slug IN ('7eme', '8eme', '9eme')` checks.
 */

export type LevelSlug = 'college' | 'lycee';

export const COLLEGE_SLUGS = ['7eme', '8eme', '9eme'] as const;
export const LYCEE_SLUGS = [
  '1ere-secondaire',
  '2eme-secondaire',
  '3eme-secondaire',
  '4eme-secondaire',
] as const;

export function isCollegeSlug(classSlug: string | null | undefined): boolean {
  if (!classSlug) return false;
  return (COLLEGE_SLUGS as readonly string[]).includes(classSlug);
}

export function isLyceeSlug(classSlug: string | null | undefined): boolean {
  if (!classSlug) return false;
  return (LYCEE_SLUGS as readonly string[]).includes(classSlug);
}
