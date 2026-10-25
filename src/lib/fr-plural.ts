// 2026-10-25 — pluralisation française des libellés de stats et d'état vide.
//
// Contexte : les pages /cours/*, /devoirs/* et /series/* utilisent TROIS
// arbres de composants parallèles (preview-cours2/, preview-devoirs2/,
// preview-series2/) qui dupliquaient chacun leur propre version de la
// pluralisation. D'où des libellés incohérents selon la page :
//   « 1 DEVOIRS », « 0 CLASSES », « 1 TRIMESTRES », « 0 DEVOIRS »
//   « Aucun devoirs pour ces filtres. », « Aucune cours pour ces filtres. »
//
// Règles françaises appliquées :
//   - 0 et 1 prennent le SINGULIER (« 0 devoir », « 1 classe »)
//   - le pluriel s'applique à partir de 2
//   - « cours » est MASCULIN et INVARIABLE (« aucun cours », pas « une cours »)
//   - « série » est FÉMININ (« aucune série »)
//
// Le libellé de type est déjà title-cased côté appelant ('Devoirs',
// 'Cours', 'Séries') — c'est le CSS qui met en capitales.

type Noun = {
  /** Forme singulière (déjà accordée en genre). */
  one: string;
  /** Accord du mot vide qui précède : 'm' → « Aucun », 'f' → « Aucune ». */
  gender: 'm' | 'f';
};

const NOUNS: Record<string, Noun> = {
  Devoirs: { one: 'Devoir', gender: 'm' },
  Cours: { one: 'Cours', gender: 'm' },
  'Séries': { one: 'Série', gender: 'f' },
};

/** Libellé d'une stat : « 1 Devoir » / « 0 Devoir » / « 55 Devoirs ». */
export function statLabel(type: string, count: number): string {
  if (count > 1) return type;
  return NOUNS[type]?.one ?? type;
}

/**
 * Message d'état vide : « Aucun devoir pour ces filtres. » /
 * « Aucune série pour ces filtres. »
 */
export function emptyStateLabel(type: string): string {
  const noun = NOUNS[type];
  if (!noun) return `Aucun ${type.toLowerCase()} pour ces filtres.`;
  const article = noun.gender === 'f' ? 'Aucune' : 'Aucun';
  return `${article} ${noun.one.toLowerCase()} pour ces filtres.`;
}
