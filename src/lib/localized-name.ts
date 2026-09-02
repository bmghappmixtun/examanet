import type { Locale } from '@/i18n/routing';

/**
 * Get the localized name for a DB item (Subject, Class, Section, Level).
 * Falls back to nameFr if the requested locale or the AR translation is missing.
 */
export function getLocalizedName(
  item: { nameFr: string; nameAr?: string | null } | null | undefined,
  locale: string  // accept any string, we'll check
): string {
  if (!item) return '';
  if (locale === 'ar' && item.nameAr) return item.nameAr;
  return item.nameFr;
}
