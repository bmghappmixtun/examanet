# Migration Vercel → Cloudflare — Étude complète

**Date**: 2026-08-22
**Status**: 🔍 Étude exploratoire (pas encore de plan de migration)
**Auteur**: Mavis (Mavis agent)

---

## TL;DR (en 30 secondes)

| Aspect | Verdict |
|---|---|
| **Faisabilité technique** | ✅ Fait — `@opennextjs/cloudflare` 1.0 GA depuis février 2026 |
| **Économie estimée** | 💰 ~50-80% moins cher en compute, 100% sur l'egress |
| **Risque migration** | ⚠️ Moyen — plusieurs pièces à adapter, ne pas le faire à la légère |
| **Effort estimé** | 📅 2-4 semaines (1 dev, full migration + tests + rollback plan) |
| **Mon avis** | 🟢 FAIRE — mais pas urgent. Planifier sur Q1 2027 ou quand un Vercel bill spike se pointe. |

---

## 1. Pourquoi on parle de migrer

### Le contexte Examanet aujourd'hui

- **Hosting** : Vercel Pro (avec l'intégration Neon gérée)
- **DB** : Neon PostgreSQL (eu-central-1) — **reste inchangé**
- **Storage** : Vercel Blob (PDFs) — **devient R2**
- **Crons** : 5 jobs via Vercel Cron — **deviennent Workers Cron Triggers**
- **CDN/Edge** : 17 régions Vercel — **devient 300+ villes Cloudflare**
- **Coût actuel estimé** : ~$30-50/mois (Vercel Pro + Neon ~$25)

### Les signaux qui font réfléchir

1. **Vercel coût à l'egress** : $0.15/GB au-delà de 1 TB. Nos PDFs (15k fichiers × ~2 MB en moyenne = ~30 GB) on est encore loin du cap, mais un seul PDF viral peut faire exploser la facture.

2. **Vercel log-drain retry storm** : quand on a eu un spike 5xx (75k logs/5min), Vercel a retry sur 17 régions edge = 252 req/sec sur notre `/api/log-drain`. On a failli se DoS nous-mêmes.

3. **Cron fixed-time** : Vercel cron est minimum `*/3h` (donc 8x/jour). Cloudflare Cron Triggers sont plus flexibles (par minute).

4. **Vercel-Vercel lock-in** : certaines features Vercel sont implicites (ISR, image opt, edge config). Sortir devient plus dur chaque jour où on les utilise.

### Mais faut pas idéaliser non plus

- Vercel est **vraiment bien foutu** pour Next.js. Tout marche out-of-the-box.
- L'équipe de Cloudflare Workers est moins large → support plus lent.
- OpenNext est 1.0 GA depuis seulement février 2026, donc pas encore "battle-tested" sur des apps aussi grosses qu'Examanet (15k URLs sitemap, 30 modèles Prisma).

---

## 2. Stack cible sur Cloudflare

### Architecture

```
┌─────────────────────────────────────────────┐
│ CLOUDFLARE (CDN global, 300+ villes)        │
│                                             │
│  ┌─────────────────────────────────────┐    │
│  │  Pages (static assets)              │    │
│  │  - /_next/static/*                  │    │
│  │  - 159 pages statiques FR/AR        │    │
│  └─────────────────────────────────────┘    │
│                    ↓                        │
│  ┌─────────────────────────────────────┐    │
│  │  Workers (Next.js via @opennextjs)  │    │
│  │  - 30+ API routes                   │    │
│  │  - RSC streaming                    │    │
│  │  - Cron Triggers (5 jobs)           │    │
│  │  - Log drain sink                   │    │
│  └─────────────────────────────────────┘    │
│         ↓ Hyperdrive (connection pool)      │
│  ┌─────────────────────────────────────┐    │
│  │  R2 (object storage)                │    │
│  │  - PDFs uploadés par les profs      │    │
│  │  - Cache R2 pour ISR (R2 inc cache) │    │
│  └─────────────────────────────────────┘    │
│         ↓ (custom domain, free)             │
│  examanet.com → Worker                      │
└─────────────────────────────────────────────┘

         ↓ (toujours le même, on garde)

┌─────────────────────────────────────────────┐
│ NEON PostgreSQL (eu-central-1) — INCHANGÉ   │
│  - 30 modèles Prisma                        │
│  - 519 MB de données                        │
│  - PITR 1h                                  │
│  - 2 CU max                                 │
└─────────────────────────────────────────────┘

┌─────────────────────────────────────────────┐
│ EXTERNE (reste identique)                   │
│  - Resend (emails)                          │
│  - OpenAI / Mistral / Groq / Gemini (AI)    │
│  - Google APIs (Search Console)             │
└─────────────────────────────────────────────┘
```

### Mapping composant par composant

| Composant actuel | Équivalent Cloudflare | Notes |
|---|---|---|
| Vercel Hosting | Cloudflare Workers via `@opennextjs/cloudflare` | 1.0 GA depuis fév 2026 |
| Vercel Edge Network (17 régions) | Cloudflare global network (300+ villes) | 18x plus de POPs |
| Vercel ISR | Workers ISR via `@opennextjs/cloudflare` | Cache stocké dans R2 (binding `NEXT_INC_CACHE_R2_BUCKET`) |
| Vercel Image Opt | Cloudflare Images | Add-on payant ($5/mois + $0.50/1000 imgs) ou self-host avec loader custom |
| Vercel Blob | **R2** ($0.015/GB + egress FREE) | Migration via `Sippy` (graduel) ou `Super Slurper` (one-shot) |
| Vercel Cron (5 jobs) | **Workers Cron Triggers** | Plus flexible (par minute, pas limité à `*/3h`) |
| Vercel Functions | Workers (Node compat) | `nodejs_compat` flag, sub-ms cold start |
| Vercel Edge Functions | Workers (sub-ms cold start) | Plus rapide que Vercel Edge |
| Vercel Log Drain | Workers tail + Logpush | Logpush vers R2 ou analytics partner |
| Vercel Analytics | Cloudflare Analytics Engine | Gratuit, illimité (vs $0.00003/event Vercel) |
| Vercel Build (Turbopack) | Wrangler build + OpenNext | `wrangler deploy` = `npm run deploy` |
| Preview deployments | Cloudflare Pages previews (PR-based) | Auto via GitHub integration |
| Custom domain (examanet.com) | DNS sur Cloudflare (gratuit) | Déplacer le domaine d'OVH/Vercel vers CF |
| Neon PostgreSQL | **Hyperdrive binding** | Connection pool global, latence réduite |
| `next-intl` | **Identique** | Pas de changement (pure Next.js) |
| `next-auth` | **Identique** (Node runtime) | Pas de changement (Node APIs supportées) |
| Resend (emails) | **Identique** | Pas de changement |
| OpenAI/Mistral/Groq/Gemini | **Identique** | Pas de changement (Workers → fetch → API externe) |

---

## 3. Coût : la vraie comparaison

### Vercel Pro (1 seat, cas Examanet réel)

| Item | Quantité | Coût |
|---|---|---|
| Base | 1 user | $20/mois |
| Usage credit (inclus) | $20 | -$20 |
| Build execution (Turbopack) | ~160 min/mois | ~$20 |
| Edge requests | 7.9M (sous les 10M inclus) | $0 |
| Function invocations | 0.4M | ~$0.24 |
| Active CPU | 8.9 CPU-h | ~$1.14 |
| Provisioned memory | 22.2 GB-h | ~$0.24 |
| Fast data transfer | 214 GB (sous 1 TB) | $0 |
| Fast origin transfer | 7.63 GB × $0.06 | ~$0.46 |
| **TOTAL** | | **~$22/mois** |

(Mais : c'est ce qu'on voit sur la facture Vercel de beaucoup de side projects. Notre Neon est séparé.)

### Cloudflare Workers Paid (équivalent Examanet)

| Item | Quantité | Coût |
|---|---|---|
| Base | $5/mois | $5 |
| Requests | 7.9M (sous 10M inclus) | $0 |
| CPU time | ~32M CPU-ms (un peu au-dessus) | $0.04 |
| **R2 storage** | 30 GB PDFs + cache | **$0.45** (0.015 × 30) |
| **R2 Class A** (writes upload prof) | ~10k/mois | **$0.05** |
| **R2 Class B** (reads PDF) | ~500k/mois (50% des 1M gratuit) | **$0** |
| **R2 egress** | Illimité | **$0** 🎉 |
| **Workers KV** (cache sitemap) | 0 (on utilise R2) | $0 |
| **Hyperdrive** | Inclus dans Workers Paid | $0 |
| **Cron Triggers** | Inclus | $0 |
| **Logpush** | Inclus | $0 |
| **DNS** | examanet.com | $0 |
| **TOTAL** | | **~$5.50/mois** |

### Économie : **~75% moins cher** ($22 → $5.50)

Et ça s'aggrave en **faveur de Cloudflare** quand :
- L'egress explose (viral PDF, bot crawl excessif)
- Le nombre de requêtes augmente (scolarité rentrée septembre)
- Les builds sont plus fréquents

#### Cas réel : si on reçoit 10M requêtes/mois (rentrée scolaire)
- **Vercel** : ~$25-30 (overages sur edge requests, invocations)
- **Cloudflare** : ~$8-12 (overages requests à $0.30/M, CPU overage)

#### Cas stress : 100M requêtes/mois (pic bac 2027)
- **Vercel** : ~$1,625 (10 TB egress × $0.15/GB)
- **Cloudflare** : ~$51 (egress toujours gratuit)

---

## 4. Étapes de migration (chronologie)

### Phase 0 — Préparation (semaine 1)

- [ ] Créer compte Cloudflare
- [ ] Installer Wrangler : `npm i -D wrangler@latest`
- [ ] Créer `wrangler.jsonc` (vide pour l'instant)
- [ ] Backup Neon : `pg_dump` → upload sur R2
- [ ] Tester `next build` localement

### Phase 1 — Adapter la stack (semaine 2)

- [ ] `npm install @opennextjs/cloudflare`
- [ ] Lancer `npx @opennextjs/cloudflare migrate` (auto-setup)
- [ ] Supprimer tout `export const runtime = "edge"` (Workers = Node runtime maintenant)
- [ ] Adapter `next.config.js` :
  - Ajouter `initOpenNextCloudflareForDev()`
  - Ajouter un `loader` custom pour `next/image` (Cloudflare Images ou self-host)
  - Configurer `nodejs_compat` flag
- [ ] Créer `wrangler.jsonc` :
  - `compatibility_flags: ["nodejs_compat", "global_fetch_strictly_public"]`
  - `compatibility_date: "2025-09-27"`
  - `assets.directory: ".open-next/assets"`
  - `r2_buckets: [{ binding: "NEXT_INC_CACHE_R2_BUCKET", bucket_name: "..." }]`
  - `hyperdrive: [{ binding: "HYPERDRIVE", id: "..." }]`
- [ ] Adapter `package.json` :
  ```json
  "build": "next build",
  "preview": "opennextjs-cloudflare build && opennextjs-cloudflare preview",
  "deploy": "opennextjs-cloudflare build && opennextjs-cloudflare deploy"
  ```
- [ ] Tester localement : `npm run preview`

### Phase 2 — Adapter Prisma/DB (semaine 2-3)

- [ ] Créer un user Neon dédié pour Hyperdrive
- [ ] Créer la config Hyperdrive via `wrangler hyperdrive create`
- [ ] Adapter `prisma/client` pour utiliser Hyperdrive en prod, `DATABASE_URL` direct en dev
- [ ] Tester toutes les requêtes DB

### Phase 3 — Migrer les blobs (semaine 3)

- [ ] Créer un bucket R2 `examanet-pdfs`
- [ ] Lancer **Sippy** (gradual migration) : Vercel Blob → R2
  - Sippy copie à la demande (lazy)
  - Pas de downtime
- [ ] Adapter `next.config.js` ou les handlers d'upload pour écrire directement dans R2

### Phase 4 — Adapter les crons (semaine 3)

- [ ] Dans `wrangler.jsonc`, ajouter :
  ```jsonc
  "triggers": {
    "crons": ["0 8 * * *", "0 20 * * *", "0 2 * * *", "0 3 * * *", "0 6 * * *"]
  }
  ```
- [ ] Convertir les routes cron (`/api/cron/*`) en handlers invocables par cron triggers
- [ ] Plus de Vercel Cron = plus besoin du `vercel.json`

### Phase 5 — Tests (semaine 3-4)

- [ ] Deploy sur environnement preview CF (`wrangler deploy --env preview`)
- [ ] Tests E2E (Playwright) — déjà en place
- [ ] Tests de charge : `wrk` ou `k6` pour valider la latence
- [ ] Tests SEO : sitemap, hreflang, canonical
- [ ] Tests de sécurité : CSP, CORS, RLS

### Phase 6 — Cutover (semaine 4)

- [ ] Changer les DNS pour pointer examanet.com vers Cloudflare
- [ ] Monitorer pendant 7 jours
- [ ] Garder Vercel en "standby" 30 jours (rollback facile)
- [ ] Annuler Vercel Pro (ou garder en free si on a des petits services)

### Phase 7 — Cleanup (semaine 5+)

- [ ] Supprimer `vercel.json`
- [ ] Supprimer l'intégration Vercel↔Neon
- [ ] Supprimer le code mort (ex: `setupDevPlatform()` si présent)
- [ ] Documenter la nouvelle infra dans `docs/architecture.html`

---

## 5. Risques & mitigations

### Risques élevés (à traiter sérieusement)

| Risque | Impact | Mitigation |
|---|---|---|
| **OpenNext pas 100% compatible avec next-intl v4** | Build error, ISR cassé | Tester sur preview en premier, avoir Vercel en fallback |
| **React PDF viewer (pdfjs-dist) sur Workers** | Memory limit (128 MB), runtime error | Tester les 15k PDFs, certains gros PDFs peuvent fail |
| **`@auth/prisma-adapter` + Node compat** | Auth peut casser en edge | Workers Node runtime = OK, mais tester login flow |
| **Log drain missing** | Perte de visibilité sur erreurs | Configurer Logpush vers R2 dès le jour 1 |
| **ISR cache cold start** | Premier hit après deploy = slow | R2 inc cache binding = warm, mais tester |
| **Image optimization** | next/image peut fail | Custom loader vers Cloudflare Images ou `unoptimized: true` |
| **Cron triggers plus rigides** | Si on change le schedule, faut re-deploy | Pas un gros risque, juste un workflow change |
| **Vercel Blob URLs en DB** | 15k PDFs ont des URLs Vercel | Sippy = transparent, sinon batch update via SQL |

### Risques moyens

| Risque | Impact | Mitigation |
|---|---|---|
| **DNS cutover mal géré** | Downtime | Utiliser Cloudflare DNS avant le cutover (graduel) |
| **Custom headers (CSP, etc.)** | Sécurité | Adapter `public/_headers` (CF syntax, pas Vercel) |
| **Geographic compliance** | Données hors EU | Workers = global, Neon = EU-Central-1. OK. |
| **Build time plus long** | DX légèrement dégradé | `opennextjs-cloudflare build` = ~30s vs Vercel ~20s |

### Risques faibles

| Risque | Impact | Mitigation |
|---|---|---|
| **Prévisualisation de PR** | DX | Cloudflare Workers Previews = OK, mais moins intégré que Vercel |
| **Vercel Analytics & Speed Insights** | Monitoring | Migrer vers Cloudflare Analytics Engine (gratuit) |
| **Perte des redirects Vercel** | 404 sur anciennes URLs | `public/_redirects` (CF syntax) |

---

## 6. Pièges connus (détails)

### 6.1. **`next/image` sans custom loader = build fail**
Si on a des images non-statiques (ou un loader Vercel par défaut), le build Cloudflare va fail. Solution : custom loader ou `images.unoptimized: true`.

### 6.2. **Workers Memory = 128 MB max**
Si on a des routes qui chargent 200 MB de JSON (stats admin), ça va OOM. Solution : paginer, ou utiliser des Durable Objects (jusqu'à 1 GB).

### 6.3. **`@neondatabase/serverless` et Hyperdrive ne se mélangent pas**
Si on utilise Hyperdrive (recommandé), il faut utiliser `pg` ou `postgres.js`, **pas** le driver Neon. Sinon double pooling = lent.

### 6.4. **`getMessages()` de next-intl utilise des cookies en interne**
Notre page home doit rester dynamique pour l'i18n. Pas un nouveau problème (déjà connu sur Vercel). Mais sur Workers, le cookie parsing est plus strict.

### 6.5. **Cloudflare R2 path-style vs Vercel Blob flat**
Les URLs ne seront pas les mêmes. **Sippy** gère la transition : il sert depuis Vercel Blob tant que la copie R2 n'est pas faite, puis migre au premier read.

### 6.6. **Le blog officiel de Cloudflare utilise `@cloudflare/next-on-pages`**
Mais c'est **deprecated**. **Faut utiliser `@opennextjs/cloudflare`**. (Le `next-on-pages` ne supporte que Edge runtime, c'est trop restrictif pour nous.)

### 6.7. **`nodejs_compat` n'est pas rétro-compatible**
Si on a du code qui dépend de Node 18 vs 20, ça peut foirer en dev mais pas en prod, ou inverse. Solution : forcer `engines.node` dans `package.json`.

### 6.8. **Le système de cache d'OpenNext est en alpha**
Le binding R2 `NEXT_INC_CACHE_R2_BUCKET` est la méthode recommandée, mais c'est encore jeune. Fallback possible : utiliser un tag-based cache (KV) pour les routes critiques.

### 6.9. **`vercel.json` ne sert plus à rien**
Une fois migré, ce fichier est ignoré. Faut le supprimer pour éviter la confusion.

### 6.10. **Les secrets Vercel ne sont pas migrés automatiquement**
Faut les copier manuellement via `wrangler secret put NOM_DU_SECRET` (ou via le dashboard CF).

---

## 7. Coût total de la migration

### Effort humain

| Phase | Durée | Owner |
|---|---|---|
| Préparation | 1 semaine | 1 dev |
| Adapter stack | 1 semaine | 1 dev |
| Adapter DB | 0.5 semaine | 1 dev |
| Migrer blobs | 0.5 semaine (auto via Sippy) | 0.5 dev |
| Adapter crons | 0.5 semaine | 0.5 dev |
| Tests | 1 semaine | 1 dev |
| Cutover | 1 semaine (monitoring) | 0.5 dev |
| Cleanup | 0.5 semaine | 0.5 dev |
| **TOTAL** | **~5-6 semaines** | **~4 dev-weeks** |

### Coût financier

- **Pendant la migration** : on garde Vercel actif = $20-30/mois en doublon
- **Compte Cloudflare Workers Paid** : $5/mois
- **R2** : $0.50/mois (30 GB)
- **Cloudflare Images** (si utilisé) : $5/mois de base
- **TOTAL migration** : ~$30-40 sur 6 semaines
- **Économie année 1 post-migration** : $22/mois - $5/mois = $17/mois × 12 = **$204/an**

ROI : on est **rentable en 4-6 mois**.

### Mais c'est pas que l'argent

- **Latence globale** : 300+ POPs vs 17 régions = 2-5x plus rapide hors Europe
- **Pas de surprises sur egress** : 0 vs $0.15/GB
- **Cron flexible** : par minute, pas `*/3h`
- **Plus de vendor lock-in** : open source (OpenNext), R2 = S3-compatible

---

## 8. Alternatives à considérer

| Option | Pour | Contre | Verdict |
|---|---|---|---|
| **Cloudflare Workers (recommandé)** | Prix, perf, R2, global | OpenNext jeune | 🟢 FAIRE |
| **Rester sur Vercel** | DX parfaite, support | Coût egress, lock-in | 🟡 STAY si on a pas le temps |
| **Netlify** | Bien pour sites statiques | Pire sur le pricing serverless | 🔴 NON |
| **Render / Railway** | Simple, Node.js pur | Pas edge, scaling limité | 🟡 OK pour side project |
| **AWS (CloudFront + Lambda + S3)** | Mature, toutes les features | Complexe, cher | 🔴 Trop d'overhead |
| **Self-host sur VPS** (Hetzner, OVH) | Max contrôle | Pas serverless, scaling manuel | 🔴 NON, trop de boulot |

---

## 9. Ma recommandation

### Court terme (0-3 mois)
🟡 **Rester sur Vercel**. C'est une grosse migration, on a d'autres priorités :
- Process Informatique collège (53 files)
- Cleanup des fichiers orphelins
- Submit le sitemap à Google Search Console

### Moyen terme (Q1 2027)
🟢 **Migrer** une fois que :
- OpenNext a 6+ mois de production stable (août/septembre 2026)
- Cloudflare Images est plus mature
- On a 1-2 features qui ne marchent pas bien sur Vercel (trigger)

### Comment démarrer (si tu veux commencer)

1. **Aujourd'hui** : Créer un compte Cloudflare, ajouter `examanet.com` en DNS (sans cutover, juste pour setup)
2. **Semaine prochaine** : Créer une branche `cloudflare-poc` et faire le `npx @opennextjs/cloudflare migrate` sur une copie du repo
3. **Push sur CF Pages preview** (pas encore de cutover) — tester pendant 1-2 semaines
4. **Décider** : si OK, planifier le cutover complet

### Mon avis franc

> 💭 Si on est 100% honnête : on n'a **pas urgence** à migrer. Notre facture Vercel est faible (~22-30/mois), le DX est excellent, et l'équipe a déjà plein à faire. **Mais** la migration est faisable et rentable. Je la planifierais pour **Q1 2027** (après le pic du bac, avant la rentrée 2027-2028). Entre-temps, je peux faire un **POC technique** sur une branche à part, pour qu'on ait déjà le "hello world" qui marche quand on décidera de basculer.

---

## 10. Checklist "ready to migrate"

Avant de se lancer pour de vrai, faut que TOUS ces points soient OK :

- [ ] OpenNext 1.x stable depuis >6 mois (vérifier GitHub releases)
- [ ] Tous nos packages npm sont compatibles Node.js runtime (pas Edge-only)
- [ ] `next-intl` 100% compatible (tester en preview)
- [ ] `@auth/prisma-adapter` testé sur Workers Node runtime
- [ ] `react-pdf` / `pdfjs-dist` testé sur Workers (memory < 128 MB)
- [ ] `playwright` config migré pour tester contre CF preview
- [ ] `resend` testé sur Workers (fetch externe OK)
- [ ] Tous les AI providers (OpenAI, Mistral, Groq, Gemini) testés
- [ ] DNS d'examanet.com migré sur Cloudflare (graduel)
- [ ] Backup complet Neon vérifié (PITR + dump)
- [ ] Rollback plan documenté (DNS reverse en 5 min)
- [ ] Vercel Pro downgrade en plan Free après 30 jours de stabilité
- [ ] Documentation mise à jour (architecture, infra)

---

## Annexes

### A. Ressources

- [@opennextjs/cloudflare docs](https://opennext.js.org/cloudflare)
- [Cloudflare R2 pricing](https://developers.cloudflare.com/r2/pricing/)
- [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/)
- [Hyperdrive + Neon](https://neon.com/docs/guides/cloudflare-hyperdrive)
- [Sippy (gradual migration Vercel Blob → R2)](https://developers.cloudflare.com/r2/data-migration/)
- [Cloudflare Analytics Engine](https://developers.cloudflare.com/analytics/analytics-engine/)

### B. Scripts utiles

```bash
# Test local
wrangler dev

# Déployer en preview
wrangler deploy --env preview

# Déployer en prod
wrangler deploy

# Voir les logs
wrangler tail

# Créer Hyperdrive
wrangler hyperdrive create examanet-db --connection-string=$DATABASE_URL

# Migrer un bucket Vercel Blob → R2
# (via dashboard Cloudflare, pas de CLI pour Sippy)
```

### C. Monitoring post-migration

- **Workers Analytics** : dashboard CF → Workers → examanet → Analytics
- **R2 Analytics** : dashboard CF → R2 → examanet-pdfs → Metrics
- **Hyperdrive cache hit rate** : dashboard CF → Hyperdrive
- **Logpush** : envoyer les logs vers R2 (`logs-bucket`) ou Datadog/Logflare
- **Neon dashboard** : pour s'assurer que l'usage DB n'a pas explosé

### D. Liens internes Examanet

- [Architecture actuelle](docs/architecture.html)
- [Examanet-ops memory topic](memory:examanet-ops) — DB rotation incidents, infra gotchas
- [Neon configuration actuelle](memory:neon-cost-2026-08-21)

---

**Status** : Document de référence. Sera mis à jour quand on aura des news d'OpenNext ou un retour d'expérience de prod.
