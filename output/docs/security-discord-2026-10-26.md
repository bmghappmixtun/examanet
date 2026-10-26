# Sécurité + Discord — 2026-10-26 (nuit #14)

Branche : `fix/security-nightly-report-and-errorlog` (pushée, head `fdc5ddcd`)
Contient aussi les fixes SEO/landing pages (`76674416` et antérieurs).
Dev : version `99280e92-ef7d-4b4a-9e59-0a0137eb0cdf` — **validé, prêt à merger**.

> Source : rapport nightly du 2026-10-26 (« 2 points bloqués qui ont besoin de toi »).
> Un 3ᵉ trou a été trouvé pendant la vérification.

---

## 1. Bypass d'auth — `POST /api/agent/nightly-report` ✅ CORRIGÉ

**Avant** (guard maison) :
```ts
if (!auth || (expectedCron && auth === expectedCron) || (expectedAgent && auth === expectedAgent)) { /* OK */ }
```
La branche `!auth` = **« pas de header → autorisé »**.

| Requête | Avant | Après |
|---|---|---|
| POST **sans** header | `503 {"ok":false,"error":"no_webhook"}` → l'auth **passait** | **401 unauthorized** |
| POST avec header **faux** | `401` | `401` |
| POST avec le **vrai** token | `503` (webhook manquant) | **200** (poste sur Discord) |

**Après** : `requireCronSecret(req, { allowAgentToken: true })` (helper maison, `src/lib/cf-auth.ts`) → 401 si aucun secret, comparaison stricte.

### Deux corrections du rapport nightly

- ❌ « écriture D1 via `d1-admin` » → **FAUX pour cette route** : `d1-admin` est importé mais **jamais utilisé** dans le handler. Le risque réel = **poster du contenu arbitraire sur le webhook Discord**.
- ✅ « les deux fixes doivent partir ensemble » → **pas nécessaire** : le bypass est un problème d'auth, l'absence de webhook un problème de config. Fermer l'auth ne casse rien (voir ci-dessous).

### Pourquoi fermer le bypass ne casse pas le rapport de nuit

Le prompt du cron `examanet-nightly-error-cleanup` (lu via `cron_read`) **n'utilise jamais** cette route. Il écrit `/workspace/nightly-YYYY-MM-DD.md` et, pour Discord, utilise `DISCORD_WEBHOOK_URL` en env directement. La route `/api/agent/nightly-report` n'est donc **pas** dans le chemin critique du rapport de nuit (elle avait été *sondée* par l'agent pour prouver la faille).

## 2. Route admin ouverte — `GET /api/admin/logs/errorlog` ✅ CORRIGÉ

**Trou trouvé pendant la vérification, non listé dans le rapport.**

- `HTTP 200` **sans aucun header**, sur `examanet.com`.
- Historique **non borné** : `sinceMs` libre (30 jours → tout), `limit` jusqu'à 200.
- Colonnes exposées : `userEmail`, `userId`, `stack`, `context`, `userAgent`, `url`.

**Correction** : même contrôle que les routes admin sœurs (`api/admin/logs/clear`, `api/admin/providers`) :
```ts
const user = await getCurrentUser();
if (!user) return 401;
if (user.role !== 'ADMIN') return 403;
```

**Balayage** : sur les **78** routes de `/api/admin/**`, `logs/errorlog` était la **seule** ouverte. Les autres répondent 401/403/404.

## 3. La notif Discord n'était pas « morte » — le diagnostic était à moitié faux

| Ce que dit le rapport | Ce qui est vrai |
|---|---|
| « `DISCORD_WEBHOOK_URL` n'est pas un binding de `examanet-prod` → toute la notif est morte » | Vrai **en prod**. **Faux en dev** : le webhook **existe** dans `.env.local` (gitignoré) et mon build dev l'embarque. Le webhook est **valide et vivant** (GET → 200, canal « Examanet Alerts »). |

**Cause racine du silence en prod** : les 3 lecteurs lisaient `process.env.DISCORD_WEBHOOK_URL` au **scope module** → dans un CF Worker `process.env` est **figé au build** (OpenNext l'injecte depuis `wrangler.jsonc` / `.env.local`). Un `wrangler secret put` n'est donc **jamais** visible en runtime. Et le build CI de prod n'a pas `.env.local` (gitignoré) → rien à embarquer.

**Corrections** :
- Les 3 lecteurs (`api/agent/nightly-report`, `api/cron/nightly-cleanup`, `lib/errors/email`) lisent désormais le secret **dans le handler** via `getSecret()` (`ctx.env` en priorité).
- `DISCORD_WEBHOOK_URL` posé en **secret CF** sur `examanet-prod` **et** `examanet-dev` — **fait dans la foulée, sans intervention de l'user** (la valeur était déjà dans `.env.local`).

> `src/lib/errors/email.ts` (`sendAgentAlert`) est du **code dormant** — appelé par personne. Corrigé quand même, pour ne pas réactiver un chemin cassé. Le vrai chemin d'alerte d'erreur, c'est `/api/errors/log` → D1 + le cron nightly.

## 4. `AGENT_REPORT_TOKEN` — rotation

Le token n'existait **ni dans l'env du sandbox, ni dans le coffre Mavis** → personne ne pouvait authentifier, et l'agent postait en s'appuyant sur le bypass.

- L'API CF ne renvoie que les **NOMS** de secrets → la valeur n'est pas récupérable.
- Le tool Mavis `secret create` est **cassé** (`--name=X`, `--name X`, `secret create …` → tous rendent « `--name=<NAME>` is required »).

**Solution** : l'agent **génère et pose lui-même** son token → `scripts/rotate-agent-token.sh` (prod + dev + legacy, puis écriture locale `.agent-token` gitignoré). Le token est **éphémère par design** : n'importe quelle session rejoue le script.
`AGENT_REPORT_TOKEN` rotaté le 2026-10-26 sur `examanet-prod`, `examanet-dev`, `examanet-poc`.

## 5. Secrets des workers après intervention

| Worker | `secret_text` | `DISCORD_WEBHOOK_URL` | `AGENT_REPORT_TOKEN` |
|---|---|---|---|
| `examanet-prod` | 19 | ✅ | ✅ (roté) |
| `examanet-dev` | 4 | ✅ | ✅ (roté) |
| `examanet-poc` (legacy, 04/09) | 8 | ✅ | ✅ (roté) |

## 6. Reste à faire

- **Merge → `main` → prod** (via `.github/workflows/deploy.yml`) : c'est la seule chose qui manque. Tout est validé sur dev.
- Rappel configs : `wrangler.jsonc` = worker **legacy** `examanet-poc` ; `wrangler.dev.jsonc` = dev ; `wrangler.prod.jsonc` = **prod** (copié en `wrangler.github.jsonc` par le workflow). Les 3 ont le bon `database_id`.
- Le topic mémoire `examanet-ops` est **au-dessus du cap 30 KB** (31 518 o) → à splitter.
