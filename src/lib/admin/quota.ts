/**
 * Admin page utilities — quota display, formatting helpers.
 *
 * Centralizes small bits of logic that were duplicated across
 * /admin/fournisseurs cards (formatNumber, date formatting, % thresholds).
 */

import { formatNumber as fmt } from '@/lib/utils';

// Re-export to keep the import surface tiny for admin cards.
export const formatNumber = fmt;

/**
 * Pick the bar color based on % used.
 *  - 0-50% : green
 *  - 50-80%: amber
 *  - 80%+  : red
 */
export function quotaBarColor(percent: number | null | undefined): string {
  const p = percent ?? 0;
  if (p > 80) return 'bg-red-500';
  if (p > 50) return 'bg-amber-500';
  return 'bg-emerald-500';
}

/**
 * Compute a clamped % for the progress bar fill.
 *  - clamps to [0, 100]
 *  - returns 0 if percent is null/undefined
 */
export function clampPercent(percent: number | null | undefined): number {
  if (percent == null) return 0;
  return Math.min(100, Math.max(0, percent));
}

/**
 * Format a French date range (e.g. "1 janvier 2025 → 7 janvier 2025")
 * for a usage period. Returns empty string if periodStart is missing.
 */
export function formatPeriod(
  periodStart: string | Date | null | undefined,
  periodEnd: string | Date | null | undefined,
): string {
  if (!periodStart) return '';
  const start = new Date(periodStart);
  const end = periodEnd ? new Date(periodEnd) : new Date();
  return `${start.toLocaleDateString('fr-FR')} → ${end.toLocaleDateString('fr-FR')}`;
}

/**
 * Check if an error string looks like a 403 / Authentication issue.
 * Used to show the "missing CF scope" hint.
 */
export function isAuthError(error: string | null | undefined): boolean {
  if (!error) return false;
  return error.includes('403') || error.includes('Authentication');
}

/**
 * Format a 7-day window as "il y a X jours" relative description.
 * Not currently used but exported for future quota trend labels.
 */
export function relativeDays(days: number): string {
  if (days === 0) return "aujourd'hui";
  if (days === 1) return 'hier';
  if (days < 7) return `il y a ${days} jours`;
  if (days < 30) return `il y a ${Math.round(days / 7)} semaine(s)`;
  return `il y a ${Math.round(days / 30)} mois`;
}
