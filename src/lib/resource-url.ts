/**
 * resource-url.ts
 *
 * Helper to build resource URLs in the new Etsy-style format.
 *
 * URL pattern: /ressources/{numericId}/{slug}
 * - numericId: stable, never changes (Etsy-style)
 * - slug: cosmetic / SEO, can change anytime
 */

/**
 * Build a resource URL from a Resource object (or partial).
 * Always returns a URL in the new format.
 */
export function resourceUrl(r: { numericId?: number | null; slug: string; id: string }): string {
  // If we have a numericId, use the new format
  if (r.numericId != null) {
    return `/ressources/${r.numericId}/${r.slug}`;
  }
  // Fallback (shouldn't happen post-migration): use cuid as ID
  return `/ressources/legacy-${r.id}/${r.slug}`;
}

/**
 * Build an absolute URL (with site domain).
 */
export function absoluteResourceUrl(
  r: { numericId?: number | null; slug: string; id: string },
  baseUrl?: string,
): string {
  const base = baseUrl || process.env.NEXT_PUBLIC_SITE_URL || 'https://examanet.com';
  return `${base}${resourceUrl(r)}`;
}

/**
 * Get the canonical URL for a resource, used in metadata.
 * For old-format URLs (no numericId), this is the same as the URL itself.
 */
export function canonicalResourceUrl(r: {
  numericId?: number | null;
  slug: string;
  id: string;
}): string {
  return resourceUrl(r);
}

/**
 * Build the resource viewer URL (for the dedicated PDF reader).
 */
export function resourceViewerUrl(r: {
  numericId?: number | null;
  slug: string;
  id: string;
}): string {
  return `${resourceUrl(r)}/viewer`;
}
