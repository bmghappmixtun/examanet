# Investigation nocturne — groupe React #425 / #422 (`/fr/ressources/3562`)

**Date :** 2026-10-24 · **Auteur :** Mavis · **Contexte :** suite du rapport nightly
`nightly-2026-10-24.md` (recommandation A « source maps en production »).

---

## TL;DR

La recommandation A du rapport nightly **pose une prémisse fausse** : les source maps
sont **déjà activés** et la stack est **déjà persistée**. Le feu vert demandé depuis
11 nuits produirait un no-op.

Plus important : **les source maps ne peuvent pas résoudre le groupe #425/#422**,
parce que la stack de ces erreurs ne contient, par design de React, **aucune frame
applicative**. Elles ne sont remappables que vers de l'intérieur de react-dom.

Ce qui manque réellement, c'est le **remapping des stacks côté serveur** dans la route
de log d'erreurs — utile pour l'**autre** groupe (`X is not a function`, 34 ev.),
pas pour celui-ci.

---

## 1. La recommandation A est déjà implémentée

| Élément | Attendu par la reco A | État réel | Preuve |
|---|---|---|---|
| `productionBrowserSourceMaps` | à activer | **déjà `true`** | `next.config.js:228` (depuis 2026-09-16) |
| Persister `error.stack` | à ajouter | **déjà dans l'INSERT** | `src/app/api/errors/log/route.ts:36` |
| Stack réellement stockée | — | **253 / 300 (84 %)** | `SELECT count(stack) FROM ErrorLog` |

```
ErrorLog total      : 300
avec stack non vide : 253
SANS stack          : 47
```

→ **Aucun commit n'est nécessaire pour la reco A telle qu'elle est formulée.**

## 2. …mais les stacks stockées sont minifiées, et c'est le vrai trou

```
Uncaught Error: Minified React error #425; visit https://react.dev/errors/425 …
    at sq (https://www.examanet.com/_next/static/chunks/fd9d1056-043c97601d71967e.js:1:146768)
    at co (https://www.examanet.com/_next/static/chunks/fd9d1056-043c97601d71967e.js:1:158782)
    at https://www.examanet.com/_next/static/chunks/fd9d1056-043c97601d71967e.js:1:99419
    at iu (https://www.examanet.com/_next/static/chunks/fd9d1056-043c97601d71967e.js:1:103870)
    at ia (https://www.examanet.com/_next/static/chunks/fd9d1056-043c97601d71967e.js:1:95226)
```

Chunks identifiés :
- `fd9d1056-*.js` = **react-dom** (`sq`, `co`, `iu` = `didNotMatchHydratedTextTextInstance`, `throwOnHydrationMismatch`, …)
- `2117-*.js` = **router app-router Next.js** (`M` = scheduler)

**Conséquence directe** : appliquer une source map sur cette stack la remettrait
dans react-dom. Elle ne pointera **jamais** sur le composant applicatif, parce que
React jette l'erreur depuis `didNotMatchHydratedTextTextInstance` **sans owner dans
la stack**. Ce n'est pas un bug de notre instrumentation, c'est le comportement de React.

→ **Les source maps ne sont PAS la clé pour #425/#422.** Elles le sont pour le groupe
`X is not a function` (34 ev.), où une frame applicative existe.

## 3. Le remapping côté serveur (le vrai manque de la reco A)

`/api/errors/log/route.ts` reçoit la stack brute du navigateur. Elle pourrait :
1. extraire le nom de chunk (`/_next/static/chunks/<chunk>.js:1:<col>`),
2. récupérer le `.map` correspondant (déjà servi en prod grâce à `productionBrowserSourceMaps`),
3. appliquer `@jridgewell/trace-mapping` pour obtenir `src/components/…tsx:42:13`,
4. stocker la stack remappée.

Effort ≈ 1 h. Bénéfice : le groupe `X is not a function` / `Script error.` (34 ev.)
devient attribuable. Nécessite de mettre les `.map` en cache (KV ou R2) pour ne pas
refetcher à chaque erreur.

## 4. Deux bugs réels trouvés au passage

### 4.1 Leçon #108 récidivante — JSON-LD en racine array

`src/app/[locale]/ressources/[id]/[slug]/page.tsx:241`

```ts
jsonLdScript = safeJsonLd([jsonLd, breadcrumbJsonLd]);   // ← racine ARRAY
```

Le garde-fou `safeJsonLd` teste `json.includes('"@context"')` : un array de deux objets
qui contiennent chacun `@context` **passe** le test. Le garde ne protège donc pas.
Or Safari 17.6 crash sur une racine array (`undefined.toLowerCase`).

En prime, la même page rend **3 scripts ld+json** :
- 1 côté serveur (le tableau ci-dessus) — `page.tsx:260-265`
- 2 côté client (`ResourceDetailClient.tsx:216-221`), racines objets correctes
  mais **dupliquant les mêmes schémas**.

### 4.2 `next.config.js` — commentaire contradictoire

```js
// TEMP DEBUG (2026-09-16): enable source maps to diagnose React hydration errors
// REMOVE after fix is confirmed - source maps expose source code publicly
// SECURITY: Block source maps from being served in production
productionBrowserSourceMaps: true,      // ← fait l'inverse du commentaire
```

Les source maps **sont** servies publiquement en production. Le commentaire dit le
contraire. À trancher : soit on garde (et on corrige le commentaire), soit on coupe
et on accepte des stacks non remappables.

## 5. Hypothèses éliminées pour le #425

| Hypothèse | Verdict | Preuve |
|---|---|---|
| Leçon #101 — `toLocaleString()` sans locale | **écartée** | 1 seul appel non épinglé (`recherche-ai/page.tsx:559`), état client, jamais SSR |
| `ResourceCard` — `Date.now()` au rendu | **écartée** | server component, calcule `initialLabel` et délègue à `ResourceAge` (pattern SSR-baked correct) |
| `Footer` — année courante | **écartée** | année calculée côté serveur, commentaire explicatif sur le fuseau |
| `ResourceDetailClient` — rendu initial | **écartée** | `useState(true)` → spinner des deux côtés |
| Cache HTML edge Cloudflare | **écartée** | `cache-control: private, no-cache, no-store, max-age=0, must-revalidate`, pas de `cf-cache-status` |
| Texte divergent dans le layout partagé | **écartée** | HTML prod vs dev : 583 caractères de texte visible, **85 mots, 0 écart** |
| Prod sert un design différent de dev | **écartée** | les deux rendent « Chargement de la ressource », aucun marqueur new-design |

## 6. Reproduction en mode dev (outillage livré)

`scripts/repro-hydration-dev.cjs` lance Chromium (Playwright 1.62.1) en local contre
`next dev`, avec le **D1 distant** (`"remote": true` dans le binding, à revertir après),
et capture les messages console + `pageerror`.

**Résultat : aucune erreur d'hydratation** sur `/fr`, `/fr/ressources/3562` (AR) et
`/fr/ressources/3209` (EN), en mode dev React (build non minifié, messages complets).

→ Le #425 prod est **non reproductible en dev** à code et données identiques.
Il faut donc soit une condition propre à la prod, soit il est **intermittent**
(dépendant du timing client/serveur ou d'un état particulier).

## 7. Recommandation repriorisée

| # | Action | Effort | Impact | Remarque |
|---|---|---|---|---|
| **1** | Corriger la racine array du JSON-LD (`page.tsx:241`) + dédoublonner les 3 scripts | 30 min | crash Safari + propreté SEO | **Bug avéré, à faire** |
| **2** | Remapping des stacks côté serveur dans `/api/errors/log/route.ts` | ~1 h | rend attribuable le groupe `X is not a function` (34 ev.) | **c'est la reco A真正的, reformulée** |
| **3** | Trancher `productionBrowserSourceMaps` (garder + corriger le commentaire, ou couper) | 5 min | décision de sécurité | dépend de #2 |
| **4** | Repro prod du #425 : ouvrir le flux réseau du chunk + Playwright contre `examanet.com` (pas le dev) | ~1 h | identifie la condition prod | nouvelle piste, pas encore testée |
| **5** | Audit de l'hydratation du layout partagé | 1-2 h | faible, cause déjà écartée | **peut être dépriorisé** |

**Le blocker au plus fort levier n'est plus « les source maps »** (déjà fait) mais
« le remapping côté serveur » (#2) pour un groupe, et « la reproduction contre la
prod réelle » (#4) pour l'autre.
