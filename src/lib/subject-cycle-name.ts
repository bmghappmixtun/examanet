/**
 * Subject display name overrides by cycle (2026-10-07).
 *
 * Some subjects have a different official name at lycée level than at collège:
 *   - Technologie (collège 7-9) → Sciences Techniques (lycée 3AS/4AS Bac Technique)
 *
 * NOTE: per programme officiel tunisien (education.gov.tn), the matière at lycée
 * 3AS/4AS section « sciences techniques » is officially titled « Technologie »
 * (Mécanique + Électricité). However, in Tunisian school common usage and
 * per the user override (2026-10-07), the lycée subject is displayed as
 * « Sciences Techniques » (the SECTION name) to be more explicit for
 * end-users / parents who look for "Sciences Techniques" in search engines.
 *
 * These names are PERSISTENT in the DB; we translate at display level only.
 */
const SUBJECT_CYCLE_DISPLAY_NAME: Record<string, { college?: string; lycee?: string }> = {
  technologie: {
    college: 'Technologie',
    lycee: 'Sciences Techniques',
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
