# Examanet — Architecture Snapshot

> **Tag:** `stable-2026-07-09-pre-AR-routing`
> **Generated:** 2026-07-09T14:06:28.702Z
> **Current commit:** `e03d1d1` on `main`
> **Total commits:** 336
> **Last commit:** 2026-07-09T14:06:18+00:00

This document is the **single source of truth** for the current architecture.
If something breaks, read this first, then check git history.

---

## 🏗️ Tech Stack

| Layer | Tech | Notes |
|-------|------|-------|
| **Frontend** | Next.js 14.2.5 (App Router) | React 18, TypeScript, Tailwind CSS |
| **Backend** | Next.js API routes + Server Actions | 50+ endpoints in `/api` |
| **Database** | PostgreSQL via Neon (Launch plan) | PITR 7 days, region eu-central-1 |
| **ORM** | Prisma 5.22 | 26 models |
| **File storage** | Vercel Blob (primary) | 13.64 GB, 15,278 files |
| **Backup storage** | Cloudflare R2 (off-site) | Scripts ready, awaiting user config |
| **Auth** | NextAuth.js | Email + OTP |
| **Search** | PostgreSQL FTS + pg_trgm + unaccent | v2 engine, 1-1.5s latency |
| **i18n** | Custom (cookie-based) | FR/AR toggle, AR URL routing planned |
| **Hosting** | Vercel | Next.js optimized |
| **Analytics** | Vercel Analytics | Privacy-friendly |
| **Email** | Resend | Transactional only |

**Dependencies:** 41 prod + 13 dev

---

## 📊 Data Snapshot (2026-07-09)

| Entity | Count | Size |
|--------|-------|------|
| Users total | 2,588 | — |
| ├─ Teachers | 2,584 | — |
| └─ Students | 3 | — |
| Classes | 7 | — |
| Subjects | 27 | — |
| Sections | 25 | — |
| Resources (published) | 15,333 | — |
| TeacherFile rows | 15,278 | 13.64 GB |
| ├─ Source files (Word/etc) | 15,278 | ~6.8 GB |
| └─ Generated PDFs | 15,278 | ~7.2 GB |
| Search synonyms (FR/AR) | 35 | — |
| Views (cumulative) | 45,970 | — |
| Favorites | 6 | — |
| Comments | 1 | — |

---

## 📁 File Structure (key parts)

```
edutunisie/
├── src/
│   ├── app/                          # Next.js App Router
│   │   ├── (public routes, all SEO-ready)
│   │   ├── (private routes, all noindex)
│   │   ├── api/                      # 50+ API routes
│   │   │   ├── og/                   # Dynamic OG image generator
│   │   │   ├── search/               # Search endpoints
│   │   │   └── ...
│   │   ├── layout.tsx                # Root layout (hreflang, OG)
│   │   ├── sitemap.ts                # 15,579 URLs
│   │   └── robots.txt
│   ├── components/                   # React components
│   │   ├── layout/                   # Header, Footer
│   │   ├── resources/                # ResourceCard, filters
│   │   └── search/                   # SearchResultsV2
│   └── lib/                          # Shared utilities
│       ├── prisma.ts
│       ├── search-v2.ts              # PG search engine
│       └── structured-data.ts        # JSON-LD schemas
├── prisma/
│   ├── schema.prisma                 # 26 models
│   └── migrations/                   # All schema changes tracked
├── scripts/backup/                   # ← Disaster recovery
│   ├── db-dump.mjs                   # DB → JSON
│   ├── db-restore.mjs                # JSON → DB
│   ├── blob-sync-r2.mjs              # Vercel Blob → R2
│   ├── blob-restore-r2.mjs           # R2 → Vercel Blob
│   ├── env-check.mjs                 # Pre-deploy health check
│   └── ... (10 scripts total)
├── docs/operations/
│   ├── disaster-recovery.md          # 6 DR scenarios
│   ├── blob-r2-backup.md             # R2 setup guide
│   └── env-vars.md                   # Env reference
├── .github/workflows/                # CI/CD (NOT pushed yet)
│   ├── nightly-backup.yml            # DB daily dump
│   └── blob-sync-r2.yml              # R2 daily sync
└── package.json
```

---

## 🌐 Public Routes (15 routes, all SEO-ready)

All public routes have:
- ✅ Custom title + description
- ✅ OpenGraph + Twitter Card
- ✅ Canonical URL
- ✅ JSON-LD (Breadcrumb / ItemList / FAQ)
- ✅ hreflang (fr-TN, ar-TN, x-default)
- ✅ Dynamic OG image (`/api/og/page/[type]` or `/api/og/resource/[slug]`)

- `/`
- `/a-propos`
- `/cgu`
- `/college`
- `/concours-9eme-tunisie`
- `/contact`
- `/enseignants`
- `/faq`
- `/invitation`
- `/matieres`
- `/niveaux`
- `/professeurs`
- `/recherche`
- `/referentiel-national`
- `/ressources`

---

## 🔒 Private Routes (noindex)

- `/admin`, `/enseignant`, `/mon-compte` → `noindex, nofollow, nocache`
- `/connexion`, `/inscription`, `/en-attente`, `/verifier` → `noindex, follow`
- `/messages` → `noindex, nofollow, nocache`
- `/ressources/[slug]/viewer` → `noindex, follow`

---

## 🚀 Performance

| Metric | Target | Current |
|--------|--------|---------|
| TTFB | < 300ms | 170-235ms ✅ |
| Search latency | < 1s | 1-1.5s (PG search v2) |
| Largest route | < 500KB HTML | 509KB (`/concours-9eme-tunisie`) |
| Sitemap | < 50MB / 50K URLs | 3.3MB / 15,579 URLs ✅ |
| Shared JS | < 100KB | 87KB ✅ |

---

## 💰 Monthly Costs

| Service | Cost | Notes |
|---------|------|-------|
| Vercel Blob | ~$2.06/mo | 13.64GB storage + bandwidth |
| Neon Launch | $19/mo | 50GB transfer, PITR 7d |
| Vercel Hosting | Pro tier | (current plan) |
| Cloudflare R2 | ~$0.13/mo | Backup (after setup) |
| Resend | Free tier | < 3K emails/mo |
| **TOTAL** | ~$21-25/mo | |

---

## 🔄 Backup & Restore Strategy

| Layer | Backup | Restore time |
|-------|--------|--------------|
| **Code (git)** | GitHub full history | < 1 min (1-click) |
| **Code (golden state)** | Tag `stable-2026-07-09-pre-AR-routing` | < 5 min |
| **DB schema** | Prisma migrations | < 5 min |
| **DB data (recent)** | Neon PITR (7d) | < 15 min |
| **DB data (long-term)** | JSON dump (90d GitHub Actions) | < 30 min |
| **Blob files** | R2 (off-site) | 2-3h (full restore) |

### Recent commits
```
e03d1d1 feat(backup): code mirror to R2 + auto-generated ARCHITECTURE.md
a75d8f6 fix(backup): correct R2 cost estimate (13.64 GB measured, not 30GB guessed)
c5472f8 feat(backup): Cloudflare R2 sync scripts + docs
```

### Stable tags
- `stable-2026-07-09-pre-AR-routing`

---

## 🔧 How to Rollback to This State

### Option A: Code only
```bash
git checkout stable-2026-07-09-pre-AR-routing
npm ci
# (Vercel will auto-redeploy on push, or click "Promote to Production" in dashboard)
```

### Option B: Full restore (code + DB + files)
```bash
git checkout stable-2026-07-09-pre-AR-routing
npm ci
npx prisma generate
npx prisma migrate deploy
node scripts/backup/db-restore.mjs \
  --dir=backups/db/2026-07-09 \
  --mode=upsert
# (R2 restore only needed if Vercel Blob is gone)
node scripts/backup/blob-restore-r2.mjs --restore-all
```

### Option C: Vercel-only rollback (fastest, < 1 min)
1. Vercel dashboard → Deployments
2. Find last green deploy
3. Menu → "Promote to Production"

---

## 📝 Pending (next session)

- [ ] User pushes 2 GitHub workflows via UI (PAT lacks scope)
- [ ] User adds 5 GitHub secrets (DATABASE_URL, 4 R2 vars)
- [ ] User configures R2 bucket (10 min, `docs/operations/blob-r2-backup.md`)
- [ ] First R2 sync run
- [ ] AR URL routing (`/ar/[locale]/...`)
- [ ] Cleanup 3K stale fileUrl 404s in DB

---

## 🔗 Key Documents

- [`docs/operations/disaster-recovery.md`](docs/operations/disaster-recovery.md) — 6 DR scenarios
- [`docs/operations/blob-r2-backup.md`](docs/operations/blob-r2-backup.md) — R2 setup
- [`docs/operations/env-vars.md`](docs/operations/env-vars.md) — Env var reference
- [`README.md`](README.md) — Project intro
- [`prisma/schema.prisma`](prisma/schema.prisma) — DB schema (26 models)
