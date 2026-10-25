# Vérification des 2 pages signalées — 2026-10-25

**Pages vérifiées :**
1. `https://examanet.com/fr/devoirs/histoire-geographie?cycle=college`
2. `https://examanet.com/fr/ressources?subject=histoire&class=8eme,7eme,9eme`

**Verdict global :** les 2 pages répondent 200, **0 erreur console**, le rendu fonctionne.
Mais la page 1 affiche **1 devoir au lieu de 25** (bug de données), et la page 2 a
**aucun canonical** + une API qui ne gère pas la forme virgule.

---

## 1. Page 1 — `/fr/devoirs/histoire-geographie?cycle=college` → **BUG DE DONNÉES**

### Constat

| URL | Devoirs affichés |
|---|---|
| `/fr/devoirs/histoire-geographie?cycle=college` | **1** |
| `/fr/devoirs/histoire?cycle=college` | **25** (24 cartes) |
| `/fr/devoirs/histoire?cycle=lycee` | 20 |

La ressource affichée sur la page `histoire-geographie` :
`فرض تأليفي عدد 2 - التاريخ والجغرافيا - السابعة أساسي - (2014-2015)` — 12 ans d'âge,
en arabe, seule ressource de sa catégorie.

### Cause racine : taxonomie matière scindée en deux

Le programme officiel tunisien : au **collège**, « Histoire-Géographie » est **une matière
unique** ; au **lycée**, « Histoire » et « Géographie » sont **deux matières séparées**.

**Le code respecte cette convention** (`src/components/mega-menu/MenuMatieresCollegeLycee.tsx`) :

```ts
const SUBJECT_CYCLE: Record<string, 'college' | 'lycee' | 'both'> = {
  'histoire-geographie': 'college',   // ← ligne 56
  …
  'histoire':  'lycee',               // ← ligne 69
  'geographie':'lycee',                // ← ligne 70
};
```

**La donnée ne la respecte pas.** Deux lignes `Subject` coexistent :

| id | slug | nameFr | ressources collège |
|---|---|---|---|
| `cmqi8nr38002i2n4ajkfetiot` | `histoire` | Histoire | **43** |
| `cmqo3rkrb000ayppq9hdsb0zx` | `histoire-geographie` | Histoire-Géographie | **1** |

Et `src/app/[locale]/devoirs/[slug]/page.tsx:48` fait une **correspondance exacte** :

```sql
SELECT id, slug, nameFr, nameAr, color FROM "Subject" WHERE slug = ?
```

→ la page `histoire-geographie` ne voit que la ligne `histoire-geographie` (1 ressource).
Les 72 ressources collège taguées `histoire`/`geographie` sont **invisibles**.

### Périmètre exact de la correction

**73 ressources collège** portent un slug de matière « lycée » :

| slug source | 7ème | 8ème | 9ème | total | cible |
|---|---|---|---|---|---|
| `histoire` | 14 | 19 | 10 | **43** | `histoire-geographie` |
| `geographie` | 9 | 8 | 12 | **29** | `histoire-geographie` |
| `algo-prog` | — | 1 | — | **1** | `informatique` |

Sens inverse (lycée avec slug collège) : **2 ressources** `histoire-geographie` en
`1ere-secondaire` → à re-taguer `histoire`.

Détail par type pour `histoire` collège : `DEVOIR`, `COURSE`, `EXERCISE`, `OTHER` —
la correction doit viser **tous les types**, pas seulement les devoirs, sinon les
pages `/fr/cours/...` et `/fr/exercices/...` suffers du même problème.

### Correctifs de code annexes sur cette page

| # | Problème | Emplacement | Correctif |
|---|---|---|---|
| 1 | `<title>` dupliqué : `Devoirs histoire-geographie \| Examanet \| Examanet` | `devoirs/[slug]/page.tsx:32` | retirer `\| Examanet` — le `template: '%s \| Examanet'` du layout l'ajoute déjà (`[locale]/layout.tsx:84`). Impacte 4 balises (title, og:title, twitter:title, JSON-LD) |
| 2 | Pluralisation : « 1 ressources », « 1 DEVOIRS », « 1 TRIMESTRES » | composant hero | singulier/pluriel selon le compte |
| 3 | Stat « 1 TRIMESTRES » faux | `devoirs/[slug]/page.tsx:78` | le `COUNT(DISTINCT trimestre)` ne filtre **pas** sur le cycle, et la colonne `trimestre` est quasi NULL sur ces ressources → stat vide de sens. Aligner le `WHERE` sur celui du total, cycle compris |
| 4 | Stat « 7 CLASSES » trompeur | idem | compte le nombre total de classes du système (7), pas celles qui ont la matière. Trancher : nombre de classes **avec** la matière, ou supprimer le stat |
| 5 | meta description générique | `devoirs/[slug]/page.tsx` | « Plateforme pédagogique tunisienne #1… » est identique pour toutes les matières → perte de valeur SEO. Générer une description par matière |

---

## 2. Page 2 — `/fr/ressources?subject=histoire&class=8eme,7eme,9eme`

### Ce qui marche ✅

- HTTP 200, 0 erreur console, 24 cartes rendues
- Le filtre s'applique : 43 ressources `histoire` en `8eme/7eme/9eme`
- Le client envoie bien des paramètres **répétés** : `class=8eme&class=7eme&class=9eme`
  (nuqs `parseAsArrayOf` split la virgule — `src/components/ressources/FilterShell.tsx:137`)

### Bug 1 — l'API ne gère pas la forme virgule (incohérence inter-routes)

```
/api/ressources-data?subject=histoire&class=8eme,7eme,9eme   → total = 0   ❌
/api/ressources-data?subject=histoire&class=8eme&class=7eme&class=9eme → total = 43  ✅
```

Cause : `src/app/api/ressources-data/route.ts:41`

```ts
const classSlug = sp.getAll('class').sort();   // → ['8eme,7eme,9eme'] (UN élément)
…
conditions.push(`cls.slug IN (${classSlug.map(() => '?').join(',')})`);  // IN ('8eme,7eme,9eme')
```

`getAll()` ne split pas. Le reste du codebase le fait bien :

| Fichier | Split la virgule ? |
|---|---|
| `src/app/api/professeurs/data/route.ts:34-35` | ✅ |
| `src/app/[locale]/professeurs/page.tsx:67-68` | ✅ |
| `src/components/teachers/TeachersClient.tsx:132-133` | ✅ |
| `src/app/api/ressources-data/route.ts:41` | ❌ |

**Impact utilisateur : nul** (le navigateur passe par nuqs) mais **impact réel** :
tout appel direct à l'API, fetch serveur, crawler ou script qui utilise la forme
virgule renvoie **0 résultat** au lieu de 43.

**Correctif** : normaliser comme les autres routes, ex.

```ts
const splitAll = (k: string) => sp.getAll(k).flatMap((v) => v.split(',')).map((v) => v.trim()).filter(Boolean);
const classSlug = splitAll('class').sort();
```

### Bug 2 — aucun canonical sur `/fr/ressources`

`src/app/[locale]/ressources/page.tsx:40-47` renvoie `{ title, description, robots }`
— **ni `alternates`, ni `canonical`**. Conséquences :

- les hreflang pointent vers `https://examanet.com/fr` et `https://examanet.com`
  (la **page d'accueil**) au lieu de `/fr/ressources` — hérité du layout
- la page est `index, follow` sans canonical → Google peut indexer des variantes
  de filtres (`?subject=…&class=…`) comme pages distinctes, ce qui contredit la
  règle « une seule URL canonique par page indexable » appliquée aux sitemaps

**Correctif** : ajouter dans `generateMetadata`

```ts
alternates: {
  canonical: `${baseUrl}/${locale}/ressources`,
  languages: { 'fr-TN': `${baseUrl}/fr/ressources`, 'ar-TN': `${baseUrl}/ar/ressources`, 'x-default': `${baseUrl}/fr/ressources` },
}
```

---

## 3. Méthode de vérification (reproductible)

Scripts livrés dans `scripts/` :
- `check-filtered-pages.cjs` — rendu Playwright des 2 pages (HTTP, H1, cartes, console)
- `check-devoirs-sibling.cjs` — comparaison `histoire-geographie` vs `histoire`

Piège rencontré : `pkill -f "next-server"` matche **sa propre ligne de commande** et
tue le shell. Utiliser `pkill -f "next de[v]"`.
