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
- dev `28858bac-628b-4fe2-8131-63f81fd870e4`
- `wrangler tail examanet-dev` pendant les requêtes : **539 événements, 0 erreur**
- pages dev vs prod : `bac/archives`, `college`, `ar/concours` **identiques** ;
  `fr/concours` corrigé (le paragraphe vide devient le texte réel)
- métriques dev désormais dans le nouveau namespace
