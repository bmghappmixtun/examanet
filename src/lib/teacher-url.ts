/**
 * teacher-url.ts
 *
 * Helper to build teacher profile URLs in the Etsy-style format.
 *
 * URL pattern: /professeurs/{numericId}/{slug}
 * - numericId: stable, never changes
 * - slug: cosmetic / SEO, can change anytime
 */

import { properSlugify } from './slugify';

export function teacherSlug(t: {
  firstName?: string | null;
  lastName?: string | null;
  slug?: string | null;
  email?: string;
}): string {
  if (t.slug) return t.slug;
  const first = (t.firstName || '').trim();
  const last = (t.lastName || '').trim();
  let base: string;
  if (first && last) base = `${first}-${last}`;
  else if (last) base = last;
  else if (first) base = first;
  else base = t.email?.split('@')[0] || 'prof';
  return properSlugify(base) || 'prof';
}

/**
 * Build a slug to be stored in the DB. Same logic as teacherSlug() but
 * intended for use BEFORE the row exists (no slug yet).
 */
export function buildTeacherSlug(
  firstName: string | null,
  lastName: string | null,
  email?: string,
): string {
  return teacherSlug({ firstName, lastName, email });
}

/**
 * Build a teacher profile URL from a teacher object (or partial).
 * Always returns a URL in the new format.
 */
export function teacherUrl(t: {
  numericId?: number | null;
  slug?: string | null;
  id: string;
  firstName?: string | null;
  lastName?: string | null;
  email?: string;
}): string {
  const slug = teacherSlug(t);
  if (t.numericId != null) {
    return `/professeurs/${t.numericId}/${slug}`;
  }
  // Fallback (shouldn't happen post-migration): use cuid as ID
  return `/professeurs/legacy-${t.id}/${slug}`;
}

/**
 * Build an absolute URL (with site domain).
 */
export function absoluteTeacherUrl(
  t: {
    numericId?: number | null;
    slug?: string | null;
    id: string;
    firstName?: string | null;
    lastName?: string | null;
    email?: string;
  },
  siteUrl: string = process.env.NEXT_PUBLIC_SITE_URL || 'https://examanet.com',
): string {
  return `${siteUrl}${teacherUrl(t)}`;
}
