# Vercel → Cloudflare Migration TODO

## 🎯 Goal: 100% Vercel-free (DB, compute, storage, cron, secrets, env)

## Status: ALREADY DONE

### Phase 1: Public file URLs (done in commit 379b83f)
- [x] 15,054 TeacherFile.fileUrl migrated to /api/file/
- [x] 15,421 Resource.fileUrl migrated to /api/file/
- [x] 15,324 Resource.thumbnailUrl migrated to /api/file/
- [x] Removed preconnect to Vercel Blob in root layout
- [x] New public proxy /api/file/[...key] (R2 → Vercel Blob fallback)

### Phase 2: Frontend compute (done in commits 9739d56..ee440e9)
- [x] All public pages (matieres, ressources, professeurs, etc.) on CF Workers
- [x] Admin pages all converted to D1
- [x] /enseignant/* space converted to D1
- [x] Auth flow converted to D1 raw SQL
- [x] API routes converted to D1
- [x] Prisma removed from active code paths

## 🚧 REMAINING (will block Vercel shutdown)

### A. Admin upload routes — use Vercel Blob (`@vercel/blob`)
These routes upload PDFs/JPEGs to Vercel Blob + create D1 records. Need to be rewritten to R2.

| Route | Status | Priority |
|-------|--------|----------|
| `/api/admin/concours-9eme/bulk-upload` | Uses `put()` from @vercel/blob | HIGH — 257 concours files depend on this |
| `/api/admin/jotform-bulk-import` | Uses `put()` from @vercel/blob | HIGH — 1000+ resources came from this |
| `/api/admin/jotform-migrate` | Uses `put()` from @vercel/blob | HIGH |
| `/api/admin/marouan-upload-large` | Uses `put()` from @vercel/blob | HIGH |
| `/api/admin/marouan-upload-url` | Uses `put()` from @vercel/blob | HIGH |
| `/api/admin/resource-overwrite` | Uses `put()` + `del()` from @vercel/blob | HIGH |
| `/api/admin/tunisiecollege-import` | Uses `put()` from @vercel/blob | HIGH |
| `/api/admin/upload-thumbnail` | Uses `put()` from @vercel/blob | MEDIUM |
| `/api/admin/blob-cleanup` | Uses `del()` from @vercel/blob | MEDIUM (for deletes only) |

**All 9 admin routes use prisma too** — need D1 conversion simultaneously.

### B. Storage helper (CRITICAL — used by all uploads)
- [x] `src/lib/storage.ts` already migrated to R2 for new uploads
- [ ] Fix the `IS_VERCEL = process.env.VERCEL === '1'` condition:
      On CF Workers, this is false → tries local fs (won't work)
      → Need to detect "production = CF Workers" and always use R2

### C. Concours + Bac files (259 concours, 2634 bac = 2893 files)
- [x] Already served via /api/concours-file/ proxy (Vercel Blob as backend)
- [ ] Long-term: download all 2893 to R2, kill Vercel Blob dependency entirely
      → This is bulk data (~5-10 GB), needs a one-off migration script

### D. Cron jobs (5 jobs in vercel.json)
Need to migrate to CF Workers Cron Triggers (wrangler.toml `[triggers]`).

| Schedule | Path | In code? | Notes |
|----------|------|----------|-------|
| `0 3 * * *` | `/api/cron/cleanup-views` | ✅ yes | Move to wrangler triggers |
| `0 6 * * *` | `/api/health` | ❌ no (just GET) | Make it real cron or remove |
| `0 8,20 * * *` | `/api/db-sync` | ✅ yes | **DEPRECATE** — only manages Vercel env for Neon |
| `0 */6 * * *` | `/api/cron/agent-poll` | ✅ yes | Move to wrangler triggers |
| `0 2 * * *` | `/api/cron/nightly-cleanup` | ✅ yes | Move to wrangler triggers |

### E. Config files to delete or update
- [ ] `vercel.json` — delete or replace (CF doesn't need it)
- [ ] `.vercel/` — delete (only contains project.json, useless on CF)
- [ ] Remove `@vercel/blob` from `package.json` dependencies (after all routes migrated)
- [ ] `src/lib/storage.ts` — fix IS_VERCEL condition for CF Workers
- [ ] `src/lib/origin.ts` — remove VERCEL_URL fallback
- [ ] `src/app/api/db-sync/route.ts` — DELETE (manages Vercel env for Neon, obsolete)

### F. .env vars to migrate to CF Worker secrets/env
| Vercel env var | Used in | Replace with |
|----------------|---------|--------------|
| VERCEL_TOKEN | db-sync | DELETE (not needed) |
| VERCEL_PROJECT_ID | db-sync | DELETE |
| VERCEL_ENV_PROD/PREVIEW | db-sync | DELETE |
| BLOB_READ_WRITE_TOKEN | tunisiecollege-import | DELETE (R2 uses OIDC) |
| VERCEL | storage.ts | Detect CF instead |
| VERCEL_URL | origin.ts | Use request URL only |

### G. External services that DON'T depend on Vercel (keep)
- [x] Neon DB (separate service, DATABASE_URL works)
- [x] Resend (email)
- [x] Jotform API (separate)
- [x] CF R2 (storage)
- [x] CF D1 (database)
- [x] CF KV (cache)

### H. Documentation to update
- [ ] README.md — remove Vercel setup, add CF setup
- [ ] DEPLOYMENT.md — replace Vercel deploy with CF deploy
- [ ] DNS-SWAP-GUIDE.md — already done, but mark final
- [ ] .gitlab-ci.yml.disabled — re-enable and update for CF
- [ ] docs/ — any Vercel-specific docs

## Final check before shutdown

- [ ] 0 Vercel Blob URLs accessible from any rendered page
- [ ] 0 `@vercel/blob` imports in active code (only in /api/admin/* still to migrate)
- [ ] 0 `process.env.VERCEL*` references
- [ ] 0 cron jobs in vercel.json
- [ ] 0 references to Vercel API (deployments, envs, projects)
- [ ] 0 records in D1 with `*vercel-storage*` in any column
- [ ] Concours + Bac files (2893) downloaded to R2
- [ ] `vercel.json` + `.vercel/` deleted
- [ ] `@vercel/blob` removed from package.json
- [ ] Last CF Workers deploy verified end-to-end
- [ ] Vercel project archived (don't delete immediately, wait 1 month)
