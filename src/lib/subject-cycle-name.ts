/**
 * Subject display name overrides by cycle (2026-10-06).
 *
 * Some subjects have a different official name at lycée level than at collège:
 *   - Technologie (collège 7-9) → Technologie industrielle (lycée 3AS/4AS Bac Technique)
 *
 * These names are PERSISTENT in the DB; we translate at display level only.
 */
const SUBJECT_CYCLE_DISPLAY_NAME: Record<string, { college?: string; lycee?: string }> = {
  technologie: {
    college: 'Technologie',
    lycee: 'Technologie industrielle',
  },
};

export function getSubjectDisplayName(
  slug: string,
  defaultName: string,
  cycle?: string | null,
): string {
  if (!cycle) return defaultName;
  const override = SUBJECT_CYCLE_DISPLAY_NAME[slug]?.[cycle as 'college' | 'lycee'];
  return override ?? defaultName;
}
