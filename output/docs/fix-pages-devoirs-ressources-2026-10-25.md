# Corrections du 2026-10-25 — `/devoirs/histoire-geographie` + `/ressources`

Branche : `fix/subject-taxonomy-and-seo-meta` (pushée sur GitHub, head `19142fab`)
Dev : `examanet-dev` version `63f6f8d3-eb6d-4233-90e6-db3273ed3a77`

> Pages signalées : `https://examanet.com/fr/devoirs/histoire-geographie?cycle=college`
> et `https://examanet.com/fr/ressources?subject=histoire&class=8eme,7eme,9eme`
> → rapport de vérification initiale : `verification-pages-devoirs-ressources-2026-10-25.md`

---

## 1. Ce qui n'allait pas

| # | Symptôme | Cause |
|---|---|---|
| 1 | `/fr/devoirs/histoire-geographie?cycle=college` n'affichait que **1 devoir** (au lieu de 25) | Taxonomie matière scindée : `histoire` (collège) vs `histoire-geographie` (lycée), et la page fait un `WHERE slug = ?` exact. 43 ressources collège étaient sous `histoire`, la page en demandait `histoire-geographie` (1 ressource). |
| 2 | `/api/ressources-data?...&class=8eme,7eme,9eme` → **total 0** | `sp.getAll('class')` ne split pas sur les virgules → `IN ('8eme,7eme,9eme')`. Le navigateur lui envoyait la forme répétée (nuqs `parseAsArrayOf`) → la page affichait 43, l'API en renvoyait 0. |
| 3 | `/fr/ressources` sans canonical, hreflang vers l'accueil | Aucun `alternates` sur la page ; le layout racine émit un hreflang « accueil » (voir §4). |
| 4 | `<title>` = « Devoirs histoire-geographie \| Examanet \| Examanet » | La page ajoutait `\| Examanet` **et** le layout `[locale]` applique `template: '%s \| Examanet'`. |
| 5 | Stats hero : « 1 TRIMESTRES », « 7 CLASSES » | `COUNT(DISTINCT trimestre)` sans filtre de cycle (colonne quasi NULL) ; `allClasses.length` = toutes les classes du système, pas celles qui ont des devoirs de la matière. |
| 6 | « 1 ressources / 1 DEVOIRS » | Pluralisation française : 0 et 1 prennent le singulier. |

## 2. Corrections de données (D1 — `22ad2e7f-…`, **partagée dev/prod**)

Script : `scripts/fix-subject-retag-2026-10-25.mjs` (dry-run par défaut, assertion dure `hg=100`, `info=13`, total 113).

Référentiel officiel tunisien : **HG est une matière combinée** au collège et en 1AS/2AS ; `Histoire`/`Géographie` séparées n'existent qu'en 3AS/4AS ; `algo-prog` est une spécialité SI 3AS/4AS.

| Subject | Avant | Après |
|---|---|---|
| `histoire` (collège + 1AS/2AS) | 43 | **4** (4ème année uniquement) |
| `histoire-geographie` | 1 | **103** (7ème 24 / 8ème 27 / 9ème 22 / 1AS 11 / 2AS 19) |
| `informatique` | 220 | **233** (+13 : `algo-prog` collège + 1AS/2AS) |
| `algo-prog` | 105 | **92** (3AS/4AS uniquement) |

⚠️ Les 2 ressources `histoire-geographie` déjà en 1AS/2AS n'ont **pas** été touchées (1AS enseigne bien HG).

**Prévention de la récurrence** : `src/lib/subject-slug-by-cycle.ts` → `resolveSubjectSlugForCycle(subjectSlug, classSlug)`, branché sur `jotform-bulk-import` (le `classSlug` était déjà calculé juste avant l'appel) et sur `jotform-migrate` (sans classe → slug combiné par défaut).

## 3. Corrections de code

- `src/app/api/ressources-data/route.ts` : helper `splitAll(key)` appliqué à `type`, `class`, `section`, `subject`, `trimestre`, `year`, `language`.
- `src/app/[locale]/ressources/page.tsx` : `alternates.canonical` + `languages`.
- `src/app/[locale]/devoirs/[slug]/page.tsx` : titre sans `| Examanet` ; `trimCountQuery` et `classCountQuery` filtrés par cycle.
- `src/components/mega-menu/MenuMatieresCollegeLycee.tsx` : `histoire-geographie` : `'college'` → `'both'` (le 1AS/2AS enseignent HG ; les 28 ressources 1AS/2AS étaient invisibles dans le menu lycée).
- `src/lib/fr-plural.ts` (nouveau) : `statLabel()` / `emptyStateLabel()` — appliqué aux **3** arbres parallèles `preview-{cours2,devoirs2,series2}/ApexHero` + `ApexListing`.

## 4. Découverte majeure : le hreflang était faux sur TOUT le site

En corrigeant §1-3, l'audit a révélé que **chaque page localisée** émettait 6 balises `<link rel="alternate">` au lieu de 3, avec 3 clés hrefLang dupliquées :

```
/fr/matieres  canonical: https://examanet.com/fr/matieres   ✅
              hreflang fr-TN -> https://examanet.com         ❌ l'ACCUEIL
```

Trois causes cumulées :
1. Next.js rend les `alternates` du layout **racine** *et* ceux de la page feuille comme deux jeux distincts (le commentaire « child metadata wins » du code est faux pour `alternates.languages`).
2. Le layout `[locale]` n'est pris en compte que si la page feuille ne déclare aucun `alternates`.
3. **Le vrai coupable** : 3 `<link rel="alternate">` codés **en dur** dans le JSX du `<head>` de `app/layout.tsx`, pointant tous vers l'accueil, injectés sur toutes les pages. L'API metadata ne peut pas les dédupliquer.

**Correctif** :
- `app/layout.tsx` : suppression des 3 liens en dur + suppression des `languages` du layout racine (il ne connaît pas le pathname).
- `src/lib/seo-alternates.ts` (nouveau) : `localeAlternates(path)`, `localeAlternatesFor(path, locale)`, `localeAlternatesWithCanonical(path, canonical)`. Les routes FR/AR étant symétriques (`/fr/X` ↔ `/ar/X`, même slug), la variante AR = même chemin avec le segment de locale inversé.
- **21 pages** passées à `localeAlternatesFor(...)` : a-propos, cgu, college, contact, cours/[slug], devoirs/[slug], faq, matieres, matieres/[subject], niveaux, niveaux/[level], outils/moyenne-bac, politique-confidentialite, professeurs, professeurs/[numericId], recherche, referentiel-national, ressources/[id]/[slug], series/[slug], home.
- La home passe de `export const metadata` (statique → 100 % FR : `/ar` servait le titre français et un canonical vers `/fr`) à `generateMetadata`.
- `x-default` ajouté à `matieres/[subject]`.

> ⚠️ Rappel : ne **jamais** exporter `metadata` ET `generateMetadata` sur la même page (Next.js throw).

## 5. Vérifications

| Test | Résultat |
|---|---|
| `tsc --noEmit` | 121 erreurs avant / **121 après** (toutes préexistantes), **0** dans les fichiers touchés |
| `scripts/audit-hreflang.mjs` (42 URLs FR + AR) | **42/42 OK** — 1 seul jeu d'alternates, canonical correct, 0 doublon, 0 hreflang vers l'accueil |
| `/fr/devoirs/histoire-geographie?cycle=college` | **24 cartes** rendues (contre 1 avant) ; stats `55 DEVOIRS / 3 CLASSES / 0 TRIMESTRE` |
| `/fr/ressources?subject=histoire-geographie&class=8eme,7eme,9eme` | **24 cartes**, total 73, 0 erreur console |
| `/api/ressources-data?subject=histoire-geographie&class=8eme,7eme,9eme` | **73** (identique à la forme répétée) |
| Pluralisation | `0 DEVOIR`, `0 CLASSE`, `0 TRIMESTRE`, `0 ressource`, « Aucun devoir pour ces filtres. » |
| Méga-menu | `histoire-geographie` visible en colonne collège **et** lycée |

## 6. Reste à faire

- **Merge vers `main` + prod** : les corrections de données sont **déjà live en prod** (D1 partagé) ; les corrections de code ne le sont pas encore. Merge après validation dev.
- Branche `seo/class-section-landing` (landing pages SEO `/fr/classes/**`) toujours en attente de merge.
- Bug connu hors périmètre : JSON-LD à racine **array** dans `src/app/[locale]/ressources/[id]/[slug]/page.tsx` (Safari 17.6) + 3 scripts `ld+json` dupliqués — hors liste AUTO-FIX du nightly, à valider.
