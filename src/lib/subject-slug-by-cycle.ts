/**
 * Résolution du slug de matière en fonction du cycle.
 *
 * 2026-10-25 — correction du bug « taxonomie matière scindée ».
 *
 * Le programme officiel tunisien :
 *   - au COLLÈGE et en 1AS/2AS (tronc commun), « Histoire-Géographie » est
 *     UNE matière combinée → slug `histoire-geographie`
 *   - en 3AS/4AS, « Histoire » et « Géographie » sont DEUX matières distinctes
 *     → slugs `histoire` et `geographie`
 *   - « Algorithme et programmation » (`algo-prog`) est une SPÉCIALITÉ de la
 *     section SI en 3AS/4AS uniquement ; au collège, 1AS et 2AS la matière est
 *     `informatique` (1h/semaine, réforme 2005).
 *
 * Sans cette résolution, un fichier du collège nommé « …Histoire… » était
 * importé avec le slug `histoire` (matière de lycée) : il devenait invisible
 * sur /fr/devoirs/histoire-geographie (la page fait `WHERE slug = ?`).
 * 113 ressources étaient concernées → corrigées en base le 2026-10-25.
 */

/** Classes où « Histoire-Géographie » est une matière combinée. */
export const HG_COMBINED_CLASSES = [
  '7eme',
  '8eme',
  '9eme',
  '1ere-secondaire',
  '2eme-secondaire',
];

/** Classes où « Informatique » (et non `algo-prog`) est la matière. */
export const INFORMATIQUE_CLASSES = [
  '7eme',
  '8eme',
  '9eme',
  '1ere-secondaire',
  '2eme-secondaire',
];

/**
 * Corrige un slug de matière en fonction de la classe de la ressource.
 *
 * @param subjectSlug slug détecté (ex. `histoire`, `algo-prog`)
 * @param classSlug   slug de classe (`7eme`, `4eme-secondaire`, …) ou null
 * @returns le slug de matière correct pour ce cycle
 */
export function resolveSubjectSlugForCycle(
  subjectSlug: string | null | undefined,
  classSlug: string | null | undefined
): string {
  if (!subjectSlug) return subjectSlug as string;
  // Sans classe, on ne peut pas trancher : on garde le slug d'origine.
  if (!classSlug) return subjectSlug;

  if (
    (subjectSlug === 'histoire' || subjectSlug === 'geographie') &&
    HG_COMBINED_CLASSES.includes(classSlug)
  ) {
    return 'histoire-geographie';
  }

  if (subjectSlug === 'algo-prog' && !INFORMATIQUE_CLASSES.includes(classSlug)) {
    return 'informatique';
  }

  return subjectSlug;
}
