# Cache de tags ISR + namespace dev + erreurs next-intl — 2026-11-15

## 1. Cache de tags ISR (`KVNextModeTagCache`) — cause racine trouvée

### Symptôme
Le digest nocturne remontait une famille d'erreurs récurrentes :

```
at async KVNextModeTagCache.getLastRevalidated_fn (worker-cron.js:189631:85)
at async KVNextModeTagCache.hasBeenRevalidated (worker-cron.js:189600:29)
at async hasBeenRevalidated (worker-cron.js:188856:86)
at async Cache.getFetchCache (worker-cron.js:188910:60)
```

Le message de l'exception était **vide** : l'observabilité Cloudflare ne conserve
que la stack. 125 + 63 événements sur 7 jours.

### Diagnostic (méthode)
1. Décompilation du bundle prod (`wrangler deploy --dry-run`) → la frame
   `getLastRevalidated_fn` colonne 85 pointe sur
   `await kv.get(keys, { type: "json" })`.
2. Route de diagnostic temporaire en dev → mesure directe du seuil :
   - `kv.get([...100 clés], {type:'json'})` → **OK**
   - `kv.get([...101 clés], {type:'json'})` → **throws**
     `Error: KV GET_BULK failed: 400 You can request a maximum of 100 keys`
   - l'erreur est donc bien le bulk-get KV, **pas** un problème de binding ni
     de données (les 99 clés du namespace sont des JSON valides).

### Cause racine
L'API Workers KV impose **100 clés maximum par bulk-get**. Le cache de tags
d'OpenNext (`@opennextjs/cloudflare` 1.15.1) fait **un seul** bulk-get avec
toutes les clés d'une entrée de cache :

```js
const result = await kv.get(keys, { type: "json" });   // ← 101+ clés ⇒ 400
```

L'exception était avalée par un `catch` qui journalisait `error(e)` → d'où une
stack sans message dans l'observabilité. `getLastRevalidated` renvoyait alors
`0` ⇒ `hasBeenRevalidated` = `false` ⇒ **le cache de données était considéré
périmé à chaque lecture** ⇒ rendus à froid inutiles (coût CPU + alertes perf
« p95 élevé »).

### Second bug (même composant)
Six valeurs du namespace de tags sont au **format OpenNext ≥ 1.19**
(`{ revalidatedAt, stale, expire }`) alors que le code 1.15.1 fait
`Math.max(...valeurs)` → avec un objet dans le lot, le résultat est **`NaN`**
⇒ le cache de tags se croyait toujours périmé.

**Note** : la version amont (1.20.17) n'a **pas** corrigé le problème du
bulk-get — elle fait toujours un seul `kv.get(kvKeys)` sans découpage.

### Correctif — `open-next/kv-next-tag-cache.ts` (override maison)
- bulk-get **découpé en lots de 100 clés maximum** ;
- **les deux formats de valeur** sont acceptés (nombre ou objet) ;
- écritures par lots de 100, et **clés > 512 octets ignorées** (au lieu de
  faire échouer le lot) ;
- toute exception est journalisée avec un **message lisible** (l'observabilité
  CF ne garde que le 1er argument de `console.error`).

`open-next.config.ts` pointe maintenant sur cet override.

## 2. Namespace `APP_CACHE` dev ↔ prod séparés

`APP_CACHE` héberge trois choses : les **métriques** de performance, le cache
de requêtes applicatif et le **rate limiter**. Le dev et la prod partageaient
le même namespace (`b06e8c86…`) : les rendus lents du dev alimentaient le flux
d'alertes de la prod, et les bots du dev consommaient les quotas de rate
limiting de la prod.

- nouveau namespace **dev** : `62038d4c6b224715b6c0223c948c1ffe`
  (`examanet-dev-app-cache`)
- `wrangler.dev.jsonc` (+ `wrangler.localdev.jsonc`, non versionné) pointent
  dessus ; la prod garde `b06e8c86…`
- vérifié : après déploiement, les métriques dev arrivent bien dans le
  nouveau namespace et plus dans celui de la prod.

## 3. Bonus : 240+ erreurs next-intl (FORMATTING_ERROR) — et un bug visible

Deuxième famille d'erreurs du digest (≈ 240 événements / 7 j), stack
`at h2 → f2 → d2 → C2`. Décompilation : la colonne 134 de `f2` correspond
exactement au `catch` de **FORMATTING_ERROR** de next-intl.

### Cause
Les pages `concours-9eme-tunisie`, `bac/archives` et `college` utilisent
`t('clé')` puis font un remplacement **manuel** des marqueurs HTML :

```tsx
__html: t('concours.about.p1')
  .replace(/\{strong\}/g, '<strong>')
  .replace(/\{strongEnd\}/g, '</strong>')
```

Pour next-intl, `{strong}` est une **variable ICU** : appelée sans valeur,
`t()` lève une FORMATTING_ERROR, la journalise en prod… et **retombe sur la
clé** (`getMessageFallback`). Concrètement, en prod le paragraphe d'accueil de
la page concours affichait littéralement :

> concours.about.p1

### Correctif
Échappement ICU dans `src/messages/{fr,ar}.json` (`'{'strong'}'`) : le
message formaté contient **exactement la même chaîne** qu'avant (donc le
`.replace()` du code fonctionne à l'identique) mais ICU ne voit plus de
variable ⇒ **plus aucune erreur** et le paragraphe s'affiche.

Vérifié : 56/56 messages (28 clés × 2 locales) → sortie identique + 0 erreur.

Scripts : `scripts/fix-i18n-placeholders.mjs` (idempotent),
`scripts/audit-i18n-keys.py`, `scripts/audit-i18n-placeholders.py`.

## Vérifications

- build OpenNext : OK, override présent dans le bundle
- dev `28858bac-628b-4fe2-8131-63f81fd870e4` (puis `88c38c73` avec l'instrumentation)
- `wrangler tail examanet-dev` pendant les requêtes : **539 événements, 0 erreur**
- pages dev vs prod : `bac/archives`, `college`, `ar/concours` **identiques** ;
  `fr/concours` corrigé (le paragraphe vide devient le texte réel)

## Déploiements prod

| version | commit | contenu |
|---|---|---|
| **7.04** | `34fb8dfe` | tag cache par lots + namespace dev + échappement i18n |
| **7.05** | `bce06218` | instrumentation i18n (clé dans les logs) + path des requêtes dans le sync |

### Après 7.05 (13:55 UTC)
```
tag cache      : 0 erreur
next-intl      : 0 erreur   (337 événements/jour avant le correctif)
React props    : 2 événements (préexistants depuis le 11/11, ~2/semaine)
```
- `/fr/concours-9eme-tunisie` : le paragraphe « À propos » affiche enfin le texte
  (il affichait littéralement `concours.about.p1` en prod) — aucune clé de
  message brute ne reste dans le HTML.
- `monitor-alerts` prod : `endpointsMonitored: 17, alertsSent: 0`.
- Métriques dev dans `examanet-dev-app-cache` (6 clés `metric:*`), prod dans
  `examanet-prod-app-cache` — plus de mélange.

## Reste à faire (hors périmètre de cette intervention)

1. **Erreur React « Event handlers cannot be passed to Client Component props »**
   (`at e_ → Object.toJSON → stringify`) : **préexistante** (8 événements
   depuis le 11/11, sur `/fr` et `/ar/professeurs/[id]`), les pages s'affichent
   correctement. À traiter plus tard.
2. **Attribution des erreurs CF** : le sync lit désormais
   `$workers.event.request.path`, donc les futures erreurs seront attribuables
   à leur page (c'est ce qui a permis d'identifier `/fr/concours-9eme-tunisie`).
3. Les pages concours/bac/college utilisent encore `{strong}` comme marqueur
   HTML : le fix est l'échappement ICU (zéro risque), mais la **vraie**
   solution est `t.rich()` avec des handlers React — refactor plus gros,
   à planifier.
4. Workflow planifié Vercel → R2 (quotidien) toujours en attente de « go ».

