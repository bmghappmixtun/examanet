# Alerte « Examanet Performance Alerts » sur `/fr` — diagnostic et recalibrage

**Date** : 2026-11-14 · **Statut** : diagnostic posé + moniteur recalibré (prod)

---

## 1. De quoi s'agit-il

| | |
|---|---|
| **Email** | sujet `🚨 Examanet Alert: 1 endpoint(s) degraded` → `boutiti.mehdi@gmail.com`, corps = le tableau `Examanet Performance Alerts` (expéditeur `Examanet <noreply@examanet.com>`) |
| **Producteur** | `/api/cron/monitor-alerts` (Cloudflare cron `*/5 * * * *` sur `examanet-prod`), `src/app/api/cron/monitor-alerts/route.ts` |
| **Données** | métriques KV écrites par `worker-cron.js` (clé `metric:{ts}:{pathHash}:{uuid}`, TTL 30 min) |
| **Règles** | `errorRate > 10 %` **ou** `P95 > 1000 ms`, fenêtre de 5 min, ≥ 10 échantillons, cooldown 30 min par endpoint |

L'email reçu le 2026-11-14 10:15:36 : `/fr`, 12 requêtes, 0,0 % d'erreurs, P95 1163 ms.

## 2. Verdict : **fausse alerte**, le site est sain

- `/fr` sur la fenêtre observée : **51/51 requêtes en HTTP 200, 0 % d'erreurs** (durations KV : min 0, p50 154, p95 794, **max 1163** ms).
- Tail prod en direct (2026-11-14 10:33 → 10:40) : trafic réel served normalement, toutes les requêtes en `Ok`.
- Les deux crons répondent **200** à chaque cycle (`monitor-alerts` et `cf-observability-sync`).

## 3. Pourquoi le seuil se déclenche quand même

### 3.1 La métrique est biaisée : elle ne voit que les requêtes qui atteignent le worker
`worker-cron.js` mesure `Date.now() - startTime` **côté serveur**. En prod, le **cache edge** (`Cache-Control: s-maxage`, `next.config.js`) absorbe la majorité du trafic : ces requêtes **n'entrent jamais dans le worker**, donc ne sont **jamais mesurées**.
L'échantillon contient donc uniquement :
- les **hits ISR** internes → **~0 ms** ;
- les **rendus à froid** (SSR + 7 requêtes D1 sur `/fr`) → **0,7 à 1,6 s**.

D'où une distribution **bimodale** (0 ms vs ~1 s), et un P95 systématiquement égal à un rendu à froid.

### 3.2 Le P95 d'une fenêtre de 12 échantillons = le MAX
`p95 = latencies[floor(n * 0.95)]` → avec n = 12, index = 11 = **la requête la plus lente**.
Le mail signifiait donc littéralement : *« un rendu à froid de `/fr` a mis 1 163 ms »*.

### 3.3 Volume
2 mails le 10/11, 8 le 11/11, 3 le 12/11, 5 le 13/11, 2 le 14/11 — **les alertes ont commencé le 10/11**, quand les crons ont été réactivés (`b51d64c9` : le handler `scheduled` manquait dans le worker prod déployé).

## 4. Recalibrage appliqué (prod, commit `1f853b89` → merge `356ef305`)

| Avant | Après | Raison |
|---|---|---|
| `P95_THRESHOLD_MS = 1000` | **2500** | un rendu à froid de `/fr` à ~1,1 s est la **normale**, pas une régression |
| `s.total < 10` | **`< 20`** | une fenêtre de 12 = 1 rendu à froid + 11 hits : trop petit pour conclure |
| P95 seul | **P95 + ≥ 2 requêtes lentes** | un seul outlier ne déclenche plus rien |
| mail : P95 | mail : **P95 + p50 + n requêtes lentes** | diagnostic exploitable au prochain mail |

Le contrôle **taux d'erreur > 10 %** est inchangé (c'est le vrai signal).

## 5. Ce qui reste à traiter (vrai sujet de perf)

1. **Le rendu à froid de `/fr` coûte 0,7-1,6 s** : 7 requêtes D1 (`popular`, `recent`, 4 compteurs, `subjects`) via `nextCache(..., { revalidate: 300, tags: ['home','resources','subjects'] })` + le rendu React complet.
2. **Le cache de tags ISR (`NEXT_TAG_CACHE_KV`) lève une exception par intermittence** : `KVNextModeTagCache.getLastRevalidated` → `error(e)` (message **vide**, la stack seule est conservée par l'observabilité CF) → `hasBeenRevalidated` renvoie `false` → l'entrée de cache de données est_plus souvent considérée comme périmée → **plus de rendus à froid** que nécessaire.
   - Stack : `IncrementalCache.get → Cache.getFetchCache → hasBeenRevalidated → KVNextModeTagCache.getLastRevalidated_fn` (`worker-cron.js:189631`).
   - Les 99 clés du namespace `examanet-prod-tag-cache` sont **toutes des JSON valides** → l'erreur ne vient pas des valeurs ; reste à isoler (bulk-get KV / limite de clés).
   - Symptôme connexe : `Failed to revalidate stale page /sitemap-resources-1.xml` (6 ev).
3. **Le namespace `APP_CACHE` est partagé dev ↔ prod** (`b06e8c86184c45b690594f5fd7aa524f` dans `wrangler.dev.jsonc` comme en prod) : les métriques du worker dev et celles de la prod sont **melangées** dans le même flux. À séparer (namespace dédié pour le dev) pour que l'alerte prod ne voie que la prod.

## 6. Scripts de diagnostic ajoutés

- `scripts/read-kv-metrics.py` — lit les clés `metric:*` du KV et affiche la distribution des durées par endpoint (la source de l'alerte).
- `scripts/audit-orphan-vercel-alive.py` / `restore-orphan-pdfs-from-vercel.mjs` — voir `fix-download-button-2026-11-12.md`.
