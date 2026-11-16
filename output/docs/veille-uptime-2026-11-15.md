# Veille disponibilité Examanet — UptimeRobot + route + agent (2026-11-15)

> Né de l'outage du 7.05 (500 global sur `/[locale]/*` pendant ~7 h, découvert
> par l'utilisateur et non par une surveillance automatique).

## Les 3 couches

| # | Couche | Détecte | Latence | Coût |
|---|--------|---------|---------|------|
| 1 | **UptimeRobot** (externe, multi-régions) | site HS, DNS, edge CF global, workers.dev | ~5-10 min | 0 (free, 50 moniteurs) |
| 2 | **`monitor-alerts`** (notre cron 5 min) | taux d'erreur > 10 % sur les endpoints surveillés | ~5 min | 0 (Resend déjà en place) |
| 3 | **Agent** (tâche planifiée horaire) | tout ce qui échappe à 1 et 2 + **diagnostic + correctif + déploiement** | ≤ 1 h | ~33 k tokens / passage |

Les couches 1 et 2 s alertent **l'email** (`boutiti.mehdi@gmail.com`).
La couche 3 alerte **le user dans la conversation** et lance le diagnostic.

## 1. UptimeRobot — flux « agent » (sans compte, sans clé API)

Flow officiel : `GET /agentic/agent-monitor/challenge` → PoW (SHA-256
`<nonce>|<counter>` avec `difficulty` bits à zéro en tête) →
`POST /agentic/agent-monitor` → le propriétaire clique **Activate** dans l'email
→ compte + moniteur gratuits créés.

Script : `scripts/uptimerobot-agent-monitor.mjs`

```bash
node scripts/uptimerobot-agent-monitor.mjs --email=boutiti.mehdi@gmail.com --url=https://examanet.com/fr
node scripts/uptimerobot-agent-monitor.mjs --email=boutiti.mehdi@gmail.com --url=https://examanet.com/api/health
```

Les 2 demandes ont été envoyées le 2026-11-15 (HTTP 200). **Il reste à cliquer
« Activate » dans les 2 emails de confirmation.**

### ✅ Clé API read-only — POSÉE le 2026-11-16

L'agent-flow ne donne **pas** de clé API à l'agent (« the agent can't read your
monitoring data »). Pour que la route `/api/status/uptime` affiche aussi la vue
multi-régions d'UptimeRobot :

Clé **read-only** posée en secret worker `UPTIMEROBOT_API_KEY` sur
`examanet-prod` **et** `examanet-dev` (jamais dans Git).

Portance mesurée de la clé :
```
GET  v3/monitors    → 200      GET v3/psps        → 200
GET  v3/incidents   → 200      GET v3/integrations → 200
POST v3/monitors    → 401      « You do not have write rights for this action. »
```
⇒ elle ne peut que **lire** ✓ (la config des moniteurs reste gérée à la main
depuis le dashboard UptimeRobot).

### 🔎 Moniteurs du compte (8 au total, vérifiés via l'API)

| moniteur | URL | méthode | intervalle | région | état |
|---|---|---|---|---|---|
| agent-flow | `https://examanet.com/fr` | GET | 300 s | na | **UP** |
| agent-flow | `https://examanet.com/api/health` | GET | 300 s | na | **UP** |
| manuel | `https://www.examanet.com` | HEAD | 300 s | na | **UP** |
| manuel | `https://examanet.com/fr` | HEAD | 300 s | na | **UP** |
| manuel | `https://examanet.com` | HEAD | 300 s | na | **UP** |
| manuel | `http://www.tunisiecollege.net` | GET | 300 s | eu | UP |
| manuel | `http://www.devoirat.net` | GET | 300 s | eu | UP |
| manuel | `https://www.zitounawood.com` | GET | 600 s | eu | UP |

### 🧊 Piège : l'API UptimeRobot a SON PROPRE cache HTTP (prod 7.20)

Les réponses de `api.uptimerobot.com/v3/monitors` sont servies par le cache
d'UptimeRobot (`x-cache: HIT`, `etag`, `server: cloudflare`). Conséquence
mesurée : après la suppression de 2 moniteurs, **le worker continuait de lire
la liste d'avant suppression (8 moniteurs) pendant plusieurs minutes**, alors
que tous les autres appels API étaient à jour (6) ⇒ la veille aurait cru à
des moniteurs morts (ou, pire, ignoré la suppression).

Correctif appliqué dans la route :
```ts
fetch(`${UPTIMEROBOT_API}?t=${Date.now()}`, {
  headers: { authorization: `Bearer ${apiKey}`, accept: 'application/json',
             'cache-control': 'no-cache', pragma: 'no-cache' },
})
```

⚠️ Limite de débit UptimeRobot free : `x-ratelimit-limit: 10` requêtes/min ⇒
le cache KV 60 s de la route est **indispensable** (sinon une requête API par
appel). Les pannes du cache KV sont désormais **journalisées** (avant : `catch`
silencieux ⇒ le cache pouvait ne jamais fonctionner sans qu'on le voie).

### ⚠️ Action manuelle restante (30 s) — le trou de la panne du 15/11

UptimeRobot juge « up » une page qui répond **200 avec une page d'erreur**
(sauf s'il y a un contrôle de mot-clé) → c'est exactement le mode de panne du
15/11. Notre route le couvre ✓ (elle lit le HTML), mais UptimeRobot, non.

Sur le moniteur **GET `https://examanet.com/fr`** (id 804686243) :
*Edit → Keyword → « should not be present » → `__next_error__`*.

Sur `https://examanet.com/api/health` (id 804686242) : mot-clé **« should be
present »** → `"ok":true`.

⚠️ Les 3 moniteurs en **HEAD** ne peuvent **pas** faire de contrôle de mot-clé
(sans corps de réponse) : ils voient les 500 mais pas la page d'erreur en 200.
On peut en supprimer 2 (redondants) pour éviter 3 emails par incident — le
choix est à l'user.

Sans la clé, la route fonctionne quand même (contrôle interne) et UptimeRobot
continue d'envoyer ses propres emails.

## 2. Route `/api/status/uptime` (publique, lecture seule)

`src/app/api/status/uptime/route.ts`

- Contrôle **interne** : `GET {origine}/fr?ci=<ts>` (cache-buster → rendu à
  FROID, pas le HTML mis en cache) + `GET {origine}/api/health`.
  Sur la page d'accueil, les **16 premiers Ko du HTML** sont lus et analysés :
  une page d'erreur Next.js servie en **HTTP 200** (`<html id="__next_error__">`)
  est détectée et déclarée KO — c'est le mode de panne le plus vicieux, invisible
  pour un simple contrôle de code HTTP (c'est ce qui a laissé le site « vert »
  pendant l'outage du 15/11). Test de régression :
  `node scripts/verify-uptime-error-detection.mjs https://examanet.com`.
- ⚠️ **Le compte UptimeRobot contient aussi les AUTRES sites du propriétaire**
  (Devoirat.net, Tunisiecollege.net, Zitounawood) ⇒ le verdict ne regarde
  QUE les moniteurs `examanet.com` / `www.examanet.com`
  (`isExamanetMonitor`). Les autres remontent dans `otherMonitorsDown` +
  `warnings[]`, **sans** faire basculer le statut (sinon la veille croirait à
  une panne d'Examanet et partirait corriger le mauvais site).
- Contrôle **externe** : si `UPTIMEROBOT_API_KEY` est présent →
  `GET https://api.uptimerobot.com/v3/monitors` (`Authorization: Bearer …`).
  **Un échec de l'API n'est PAS une panne du site** : le verdict global ne
  bascule que si des moniteurs sont explicitement `down`
  (`uptimerobot.monitorsDown`), sinon c'est un simple `warnings[]`.
- Origine = celle de la requête, **liste blanche** (anti-SSRF) :
  `examanet.com`, `www.examanet.com`, `*.examanet-poc.workers.dev`.
- Cache KV 60 s (clé `uptime:status:v1:<origine>`) → pas de hammering
  (limite UptimeRobot free : 10 req/min).
- Aucun effet de bord : ni email, ni écriture D1. Réponse 200 si tout va bien,
  **503 sinon** (le corps JSON contient toujours le détail).

```bash
curl -s https://examanet.com/api/status/uptime | jq
```

## 3. Tâche planifiée de l'agent — horaire, correctiveur

- Nom : **Veille uptime Examanet** — `0 * * * *` (Europe/Paris)
- task_id : `463774934184119` · modèle **MiniMax-M3** · projet 691
- Mode : conversation dédiée (`sessionId: fixed`) → les incidents s'y cumulent.
- Comportement :
  - site up → **une seule ligne**, aucune autre action ;
  - site down → diagnostic (tail worker → Observability → D1 `CloudflareLog` →
    registre `DeploymentVersion` → git log), **puis correction autonome** :
    branche locale → correctif (≤ 40 lignes, cause à une file+line) → build →
    **déploiement dev** → vérification → merge `main` → push (la CI déploie la
    prod) → vérification prod (étape CI « Smoke test prod » verte) ;
    si la prod reste en erreur → `git revert` + push → alerte.
- Garde-fous de l'auto-fix (interdits ⇒ diagnostic + proposition, pas de commit) :
  migration D1 / schéma, `package.json` + lockfile, `next.config.js`,
  `wrangler*.jsonc`, secrets et variables d'environnement, `middleware.ts`,
  `src/lib/auth*`, `src/app/api/auth/**`, `src/app/api/admin/auth/**`,
  suppression de données, changement d'infra, plus d'1 commit et plus de
  40 lignes par exécution.
- Coût mesuré : ~33 k tokens par passage (≈ 800 k/jour en horaire).
  Premier passage réel le 2026-11-15 23:00 Paris : « Examanet UP — home 200
  (1085 ms), api-health 200 (442 ms) » en 1 seule ligne ✓.

## Vérifications

- Dev `21658b6e` : la route surveille bien le dev (`siteBase` = worker dev).
- Prod `85c5d8de` : `siteBase` = `https://examanet.com`, `ok: true`,
  home 494 ms / api 873 ms. CI verte (deploy + smoke test post-déploiement).
- One-shot de test de la tâche planifiée : cron déclenché → agent a interrogé la
  route → réponse « Examanet UP » en 1,2 s ✓ (tâche de test supprimée ensuite).

## Renforts ajoutés le 2026-11-16 (prod 7.14 → 7.18)

- **Clé read-only branchée** (prod 7.16) : `source: worker+uptimerobot`, les
  8 moniteurs du compte sont visibles depuis la route (URL, état, intervalle,
  méthode, région, durée dans l'état courant).
- **Filtre par domaine** (prod 7.18) : le verdict Examanet ne dépend plus que
  des moniteurs `examanet.com`.

- **Page d'erreur en 200 détectée** : la route lit le début du HTML et
  contrôle `__next_error__` → plus de « site vert » alors que les pages sont
  en erreur. (`scripts/verify-uptime-error-detection.mjs` : 3 tests au vert.)
- **API UptimeRobot injoignable ≠ panne** : l'API qui ne répond plus ne fait
  plus basculer le verdict global (sinon un incident réseau chez eux aurait
  déclenché un faux diagnostic + un faux correctif).
- **Lecture du HTML streamée** : le flux est annulé après 16 Ko (le Range n'est
  pas honoré par l'edge ; le gzip ramène le transfert de 414 Ko à 85 Ko).
- La **veille horaire** de l'agent (task_id `463774934184119`) a déjà tourné
  11 fois de suite sans incident ; elle lit cette route et n'agit que si
  `ok: false`.

## Nuit du 2026-11-16 — le job nocturne a, lui aussi, corrigé un bug

Le job `examanet-nightly-error-cleanup` (02:15 Paris) a poussé `0d879809`
(prod **7.13**) : **clé KV stable par hachage** pour les tags de cache
> 512 octets (les slugs arabes doublement encodés faisaient échouer le
`GET_BULK` en bloc). Le pipeline nightly est donc opérationnel de bout en
bout : digest → correctif → commit sur `main` → CI → prod.
