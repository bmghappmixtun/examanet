# Veille disponibilité Examanet — UptimeRobot + route + agent (2026-11-15)

> Né de l'outage du 7.05 (500 global sur `/[locale]/*` pendant ~7 h, découvert
> par l'utilisateur et non par une surveillance automatique).

## Les 3 couches

| # | Couche | Détecte | Latence | Coût |
|---|--------|---------|---------|------|
| 1 | **UptimeRobot** (externe, multi-régions) | site HS, DNS, edge CF global, workers.dev | ~5-10 min | 0 (free, 50 moniteurs) |
| 2 | **`monitor-alerts`** (notre cron 5 min) | taux d'erreur > 10 % sur les endpoints surveillés | ~5 min | 0 (Resend déjà en place) |
| 3 | **Agent** (tâche planifiée 15 min) | tout ce qui échappe à 1 et 2 + **diagnostic** + correctif | ≤ 15 min | ~32 k tokens / passage |

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

### Clé API (optionnel mais recommandé)

L'agent-flow ne donne **pas** de clé API à l'agent (« the agent can't read your
monitoring data »). Pour que la route `/api/status/uptime` affiche aussi la vue
multi-régions d'UptimeRobot :

1. Dashboard UptimeRobot → *Integrations → API* → créer une clé **read-only**.
2. Me la transmettre → je la pose en secret worker `UPTIMEROBOT_API_KEY`
   (`examanet-prod`), jamais dans Git.

Sans la clé, la route fonctionne quand même (contrôle interne) et UptimeRobot
continue d'envoyer ses propres emails.

## 2. Route `/api/status/uptime` (publique, lecture seule)

`src/app/api/status/uptime/route.ts`

- Contrôle **interne** : `HEAD {origine}/fr?ci=<ts>` (cache-buster → rendu à
  FROID, pas le HTML mis en cache) + `GET {origine}/api/health`.
- Contrôle **externe** : si `UPTIMEROBOT_API_KEY` est présent →
  `GET https://api.uptimerobot.com/v3/monitors` (Bearer).
- Origine = celle de la requête, **liste blanche** (anti-SSRF) :
  `examanet.com`, `www.examanet.com`, `*.examanet-poc.workers.dev`.
- Cache KV 60 s (clé `uptime:status:v1:<origine>`) → pas de hammering
  (limite UptimeRobot free : 10 req/min).
- Aucun effet de bord : ni email, ni écriture D1. Réponse 200 si tout va bien,
  **503 sinon** (le corps JSON contient toujours le détail).

```bash
curl -s https://examanet.com/api/status/uptime | jq
```

## 3. Tâche planifiée de l'agent

- Nom : **Veille uptime Examanet** — `*/15 * * * *` (Europe/Paris)
- task_id : `463774934184119`
- Mode : conversation dédiée (`sessionId: fixed`) → les incidents s'y cumulent.
- Comportement : up → une ligne ; down → tail worker + Observability + D1
  `CloudflareLog` + registre `DeploymentVersion` → cause racine → alerte dans la
  conversation, et correctif si c'est trivial et sans risque.
- Coût mesuré : ~32 k tokens d'entrée par passage (≈ 3 M/jour à 15 min).
  Passable à 30 min ou 1 h via `cron_update` si le coût gêne — la détection
  immédiate reste assurée par les emails (couches 1 et 2).

## Vérifications

- Dev `21658b6e` : la route surveille bien le dev (`siteBase` = worker dev).
- Prod `85c5d8de` : `siteBase` = `https://examanet.com`, `ok: true`,
  home 494 ms / api 873 ms. CI verte (deploy + smoke test post-déploiement).
- One-shot de test de la tâche planifiée : cron déclenché → agent a interrogé la
  route → réponse « Examanet UP » en 1,2 s ✓ (tâche de test supprimée ensuite).
