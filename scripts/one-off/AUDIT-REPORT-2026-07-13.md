# Audit complet des ressources — 2026-07-13

## Vue d'ensemble

Audit de **15 333 ressources publiées** sur Examanet pour vérifier la cohérence entre :
- Titre de la ressource
- Attributs en DB (type, classe, section, matière, année, trimestre)
- Affichage sur la page de détail

## Statistiques de l'audit initial

| Catégorie | Compte | % |
|---|---|---|
| **Ressources auditées** | 15 333 | 100% |
| **Total des mismatches détectés** | ~14 500 | 95% |

### Catégories d'incohérences initiales

| Type | Compte | Sévérité |
|---|---|---|
| **Trimestre** (T1/T2/T3 au lieu de 1/2/3) | 2 141 | 🟡 Format |
| **Type** (Devoir/Cours/Série mal classé) | 1 350 | 🔴 Critique |
| **Section** (mauvaise section 2AS) | 43+ | 🔴 Critique |
| **Section** (4AS Bac TI/Sport/etc.) | 8 | 🔴 Critique |
| **Matière** (Physique→Math, etc.) | 621 | 🔴 Critique |
| **Année** (single year au lieu de range) | 2 422 | 🟡 Mineur |

## ✅ Corrections appliquées

### 1. Format trimestre (2 141 ressources)

**Problème** : DB avait `T1`, `T2`, `T3` (format Python import) au lieu de `1`, `2`, `3` (format TypeScript).

**Source du bug** : `scripts/import_to_examanet.py` utilisait `trimester = "T1"` etc.

**Fix** : `scripts/one-off/fix-trimester-format.mjs` → `T1 → 1`, `T2 → 2`, `T3 → 3`.

### 2. Type (1 033 ressources)

**Problème** : 3 patterns mal classés par l'ancien script d'import :

| DB → Title | Compte | Exemple |
|---|---|---|
| HOMEWORK → expected COURSE | 628 | "Cours - Physique - 9ème (2018-2019)" labeled HOMEWORK |
| HOMEWORK → expected EXERCISE | 316 | "Série d'exercices N°1 - Math" labeled HOMEWORK |
| COURSE → expected HOMEWORK | 89 | "Devoir de Synthèse N°3 - Math" labeled COURSE |

**Fix** : `scripts/one-off/fix-type-mismatches.mjs` — détection de patterns (Cours/Devoir/Série) avec contexte.

### 3. Année (2 412 ressources)

**Problème** : DB avait `2010` (single year) au lieu de `2010-2011` (range) pour 2 122 ressources. 290 ressources avaient une année complètement différente de celle du titre.

**Fix** : `scripts/one-off/fix-year-format.mjs` — `2010 → 2010-2011` quand le titre contient le range.

### 4. Section (70 ressources)

**Problème** : 65 ressources 2AS avec une mauvaise section (sciences au lieu de eco-services / technologies-informatique / lettres) + 5 ressources 4AS (Bac Sport / Bac Eco-Gestion mal classées).

**Fix** :
- `scripts/one-off/fix-section-mismatches-v2.mjs` (65 fixes 2AS)
- `scripts/one-off/fix-3as4as-section-bugs.mjs` (5 fixes 4AS)

### 5. Matière (574 ressources)

**Problème** : Patterns mal classés :
- 452 "Sciences Physiques" / "Physique" étiquetées Mathématiques
- 46 "SVT" étiquetées Mathématiques
- 30 "Géographie" étiquetées Histoire
- 16 "Économie" étiquetées autre chose
- 17 "Gestion" étiquetées autre chose
- 9 "Pensée islamique" étiquetées autre chose
- 3 "Sport" / "Éducation physique" étiquetées autre chose

**Fix** : `scripts/one-off/fix-subject-mismatches.mjs` — détection du sujet principal dans le titre.

### 6. Edge cases (1 ressource)

- "histoires géographie" → matière `histoire-geographie`
- Scripts : `scripts/one-off/fix-edge-cases.mjs`

## Bilan total

| Catégorie | Ressources corrigées |
|---|---|
| Trimestre | 2 141 |
| Type | 1 033 |
| Année | 2 412 |
| Section | 70 |
| Matière | 574 |
| Edge cases | 1 |
| **TOTAL** | **6 231** |

## Faux positifs ignorés

L'audit a aussi détecté ~8 700 "mismatches" qui sont en fait **faux positifs** (artefacts de la détection automatique) :

1. **Section** : "Math" dans le titre détecté comme section `maths`, mais en fait c'est le **sujet** (ex: "Math - 3ème Sciences exp" → sujet=Math, section=Sc.exp). ~3 500 cas.

2. **Trimestre** : "Devoir N°4" inféré à T2 mais DB a T3 (système de tagging original). 4 131 cas — pas un bug, juste une convention différente.

3. **Année** : "2025" dans le titre (début d'année scolaire) vs DB "2025-2026" (range). 544 cas — titre incomplet, DB correct.

4. **Type** : "Devoir corrigé" détecté comme EXAM mais DB=HOMEWORK. C'est un devoir **avec correction**, le type est bien HOMEWORK. 235 cas.

5. **Section 4AS Bac TI** : détecté comme `technologies-informatique` mais 4AS n'a pas cette section. DB=`sciences-informatique` est correct (TI = SI en 4AS). 3 cas.

## Décisions de design laissées à plus tard

1. **Informatique subtopics** (algo-prog, tic, bases-donnees, systeme-exploitation-reseaux) : la DB a 4 sous-matières distinctes pour Informatique. Le titre dit "Algorithmique" → subtopic `algo-prog`. C'est cohérent mais on perd l'agrégation par matière parente.

2. **Type BAC_SUBJECT** vs EXAM : pas de distinction claire dans l'audit (les deux sont des sujets d'examen).

## Scripts créés

- `scripts/one-off/audit-resource-attributes.mjs` — audit complet
- `scripts/one-off/fix-trimester-format.mjs` — 2 141 fixes
- `scripts/one-off/fix-type-mismatches.mjs` — 1 033 fixes
- `scripts/one-off/fix-year-format.mjs` — 2 412 fixes
- `scripts/one-off/fix-section-mismatches-v2.mjs` — 65 fixes
- `scripts/one-off/fix-3as4as-section-bugs.mjs` — 5 fixes
- `scripts/one-off/fix-subject-mismatches.mjs` — 574 fixes
- `scripts/one-off/fix-edge-cases.mjs` — 1 fix
- `scripts/one-off/audit-mismatches.csv` — rapport détaillé

## Impact utilisateur

- **Trimestre** : Le sélecteur T1/T2/T3 fonctionne maintenant correctement sur les 2 141 ressources qui étaient cassées.
- **Type** : Les filtres "Devoir" / "Cours" / "Exercice" sur les pages /ressources retournent maintenant les bons résultats.
- **Année** : Le filtre par année scolaire fonctionne sur 2 122 ressources supplémentaires.
- **Section** : Les filtres par section 2AS/4AS retournent les bons résultats.
- **Matière** : Les filtres par matière (Physique, SVT, etc.) sont plus précis.
