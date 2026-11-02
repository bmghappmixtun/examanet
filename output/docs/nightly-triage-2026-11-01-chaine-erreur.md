# Nightly 2026-11-01 — La chaîne de triage des erreurs était morte

**Auteur** : Mavis (session du 01/11/2026)
**Commit** : `07406093` (main → CI → prod)
**Portée** : triage automatique des erreurs (nightly), pas le site public.

---

## 1. Le symptôme

`GET /api/agent/nightly-digest` répondait **HTTP 200 avec 200 lignes** — mais
elles venaient de **septembre**, pas des dernières 24 h. En prime :

| champ | valeur renvoyée | attendu |
|---|---|---|
| `count` | 200 (le plafond du `take`) | les erreurs des dernières 24 h |
| `lastRunAt` | `null` | horodatage du dernier passage du cron |
| `severities` | `[null]` | `['CRITICAL']`, `['ERROR']`… |
| `reference` | `null` | identifiant de groupe |

`GET /api/agent/digest` (celui de `session-start`) annonçait
`critical: 0, error: 0, warning: 0` **en permanence**, y compris avec 5 erreurs
CRITICAL dans la base sur les dernières 24 h.

Et dans D1 :

```
agentSeen = 1 : 201 lignes, dernière marquée le 27/10, 0 créée dans les 24 h
alors que la base contenait 16 erreurs sur 24 h (11 ERROR + 5 CRITICAL)
```

---

## 2. La cause racine : des colonnes qui n'existent pas + un piège SQLite

La table D1 `ErrorLog` a ces colonnes (vérifié par `pragma_table_info`) :

```
id source level message stack url method statusCode userId context
agentSeen createdAt updatedAt seenBySession userEmail
```

Le code lisait via le proxy Prisma-compat (`@/lib/d1-admin`) :

* `severity` → **inexistant** (la vraie colonne est `level`)
* `reference` → **inexistant** (c'est `id`)
* `agentSeenAt` → **inexistant** (le cron écrit `agentSeen = 1` + `updatedAt`)

**Le piège qui rend la panne silencieuse** : en SQLite, un identifiant entre
**double quotes** qui ne correspond à aucune colonne est traité comme un
**littéral de chaîne** (compatibilité MySQL). Donc :

```sql
WHERE "agentSeen" = 1 AND "agentSeenAt" >= 1790000000000
--        ^^^^^^^^^^^^^^ colonne réelle
--                      ^^^^^^^^^^^^^^^ Littéral 'agentSeenAt' >= 1790000000000
--                                      → en SQLite TEXT > INTEGER → toujours VRAI
```

→ le filtre 24 h est **inerte**, sans lever la moindre erreur.
Et `ORDER BY "agentSeenAt" DESC` ne trie rien (constante).

Même mécanisme pour le filtre de sévérité de `/admin/erreurs` :
`"severity" = 'CRITICAL'` → `'severity' = 'CRITICAL'` → **toujours faux** →
le filtre renvoyait 0 ligne.

> **Règle générale** : sur D1, ne jamais passer par le mapping Prisma-compat
> pour une colonne dont on n'a pas vérifié l'existence avec
> `pragma_table_info`. Le mapping échoue **en silence**.

---

## 3. La régression du cron de nettoyage (depuis le 06/09)

`src/app/api/cron/nightly-cleanup/route.ts` (migration vers le SQL brut,
commit `c7aa53c8` du 06/09) :

```sql
SELECT id, level as severity, source, message, url, createdAt, userEmail
FROM ErrorLog ...
```

`agentSeen` n'était **plus dans le SELECT**, mais le filtre JS testait
`e.agentSeen === 0 || e.agentSeen === false`. La valeur valant `undefined`,
**aucune ligne ne passait** → `unSeen` toujours vide →

1. rien n'était marqué comme vu ;
2. le **post Discord était sauté** (condition `unSeen.length > 0`) → plus
   aucun rapport nocturne — y compris après le correctif du secret Discord
   du 26/10, neutralisé par ce bug ;
3. le digest renvoyait 0 erreur.

`stack` et `context` avaient disparu du SELECT pour la même raison, alors
que le digest les expose.

---

## 4. Les correctifs (`07406093`)

| Route | Avant | Après |
|---|---|---|
| `/api/cron/nightly-cleanup` | `agentSeen`/`stack`/`context` absents du SELECT | présents ; filtre `!e.agentSeen` (couvre 0/false/null/undefined) ; niveaux en MAJUSCULES (`ERROR` **et** `error` coexistent en base) ; `reference` = `id` |
| `/api/agent/nightly-digest` | filtre 24 h inerte → backlog ; colonnes fantômes | SQL brut : `agentSeen = 1 AND createdAt >= <epoch ms>` ; `level` ; `reference` = hash du groupe (clé stable d'une nuit à l'autre) ; `lastRunAt` = `MAX(updatedAt)` = dernier passage du cron ; **échec D1 → 500** (jamais de « 0 erreur » silencieux) |
| `/api/agent/digest` | `critical/error/warning` toujours 0 ; `ref` undefined | SQL brut sur `level` + `id` ; compteurs corrects |
| `/api/admin/logs/errorlog` | filtre de sévérité inerte (0 ligne) ; compteurs vides | filtre sur `level`, sur les **deux casses** ; `groupBy` sur `level` |

Vérifications : `tsc` → 0 erreur sur les 4 fichiers (le repo passe de 121 à
114 erreurs préexistantes : 7 accès à des colonnes fantômes supprimés au
passage) ; les 3 requêtes SQL rejouées sur la D1 distante avant commit.

---

## 5. Ce qui reste ouvert (trouvé pendant l'investigation)

### 5.1 Les triggers cron Cloudflare ne sont jamais exécutés

`wrangler.prod.jsonc` déclare `crons: ["*/5 * * * *", "0 3 * * *"]`, mais le
worker déployé **n'exporte pas de handler `scheduled`** :

```js
// .open-next/worker.js
export default { async fetch(request, env, ctx) { … } };   // ← pas de scheduled()
```

Cloudflare émet l'événement `scheduled`, le worker n'a rien pour le traiter →
**les crons ne partent jamais**. Concrètement : `monitor-alerts` (5 min) et
`nightly-cleanup` (3 h) ne sont exécutés que si un agent les appelle en HTTP.

**Correctif recommandé** : entrypoint worker personnalisé (override OpenNext)
qui expose `scheduled()` et route vers les handlers `/api/cron/*` avec le
secret. C'est un changement de **pipeline de build** → à valider séparément,
non appliqué ici.

### 5.2 Les routes de digest restent ouvertes

`/api/agent/digest` et `/api/agent/nightly-digest` sont en `GET public`
(par design : l'agent appelle au démarrage de session). Elles exposent
messages, URLs, stacks et `context` (User-Agent). Elles n'exposent plus de
colonne fantôme, mais l'inventaire d'erreurs de la prod reste lisible par
n'importe qui. Durcissement possible (`requireCronSecret(req, { allowAgentToken:
true })`) — **non appliqué** pour ne pas casser l'appel du nightly. À
trancher.

### 5.3 Colonnes fantômes restantes dans `/api/admin/logs/errorlog`

`resolvedAt` et `agentNotifiedAt` sont renvoyés `null` (colonnes inexistantes).
Sans impact fonctionnel, mais trompeur dans l'UI admin.

---

## 6. Hydratation React #418/#422 — état de la chasse

Rappel : 7 occurrences sur `/admin/invitations` (Firefox 155/157/158 desktop),
déterministes (chaque visite), plus `/fr/ressources/*`, `/fr/niveaux`,
`/ar/college`, `/enseignant/analytics` (Chrome Android).

**Ce qui est prouvé** (prod, code deployed, session admin réelle) :

1. le HTML serveur de `/admin/invitations` est **structurellement identique**
   au DOM après hydratation — vérifié dans **Firefox 158** et **Chromium** ;
2. le payload RSC (extrait du HTML) confirme que le composant client est une
   simple référence : il n'y a **aucun écart de props** possible ;
3. `InvitationsClient` ne fait **aucun fetch au mount** (pas de `useEffect`) ;
4. le `<table>` est **HTML valide** (`table > [colgroup, thead, tbody]`,
   `thead > 1 tr > 8 th`) — pas de divergence de parsing Firefox ;
5. le skeleton's Suspense de `/admin` rend `[div]` comme la page → **l'invariant
   miroir est respecté** ;
6. les navigateurs concernés sont **multiples** (Firefox desktop + Chrome
   Android) → ce n'est **pas** une extension.

**Ce qui reste** : la différence entre mon Firefox propre et celui de
l'utilisateur. Prochaine étape la plus rentable : un test **fenêtre privée
sans extension** sur `/admin/invitations` (30 s côté utilisateur) — ou
l'instrumentation du log client pour capturer le contexte DOM au moment de
l'erreur d'hydratation.

Le fix de référence reste l'invariant miroir du skeleton Suspense (voir
`f0e94d5b`), qui a corrigé `/fr/ressources/[id]`.

### 6.1 La chaîne causale prouvée (31/10 10:53)

```
10:53:42Z  [CRITICAL/CLIENT] removeChild NotFoundError   /fr/ressources/3875
10:53:44Z  [CRITICAL/CLIENT] null.get (×4)              /fr/classes/3eme-secondaire/sciences-informatique
```

Un **seul appareil** (Android 10, mobile Chrome) : le mismatch
d'hydratation sur la page ressource fait **remonter le router**
(`next#67730`), et la page **suivante** (les landing pages `/fr/classes/**`)
hérite du router cassé → `null.get` ×4.

**Les landing pages `/fr/classes/**` ne sont donc pas en cause** : ce sont des
victimes collatérales. Le déclencheur est le `removeChild` sur la page
ressource.

Vérifié côté serveur : la page `/fr/ressources/[id]` sert bien son skeleton de
chargement (le `<ResourceDetailClient>` rend son état `loading` — cohérent
SSR **et** client) et le miroir `[script, script, div]` de `f0e94d5b` est
correct. Le HTML est complet (`</html>` présent, 3 boundaries Suspense toutes
fermées, 0 segment d'erreur dans le payload RSC).

### 6.2 Le nightly relisait sa propre pollution 🔥

18 enregistrements `#418`/`#422` sur `/admin/invitations` depuis le 07/09.
En croisant horodatages + User-Agent :

| UA | occurrences | origine |
|---|---|---|
| `X11; Ubuntu; Linux x86_64` (Firefox 157/158) | 4 paires — 21/10 10:55, 26/10 20:26, 27/10 20:47, 28/10 19:15 | **les sondes de diagnostic de l'agent** (Playwright+Firefox sous Linux) |
| `Windows NT 10.0` (Firefox 154/158) | 5 paires — 07/09, 21/10, 31/10 | de vrais visiteurs |

Le nightly escaladait donc un « bug prod » qui n'existait que dans son propre
harnais de test. **Correctif `5745e949`** : les sondes naviguent avec
`userAgent: 'MavisProbe/1.0 (...)'` → `POST /api/errors/log` force
`source='PROBE'` → `session-start`, `nightly-digest`, `nightly-cleanup` et
`agent-poll` excluent `source != 'PROBE'`.

