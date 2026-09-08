# Vercel → Cloudflare Migration TODO

## 🎯 Goal: 100% Vercel-free (DB, compute, storage, cron, secrets, env)

## Status: 100% DONE — Ready for Vercel + Neon shutdown

### Phase 1: Public file URLs (commit 379b83f)
- [x] 15,054 TeacherFile.fileUrl migrated to /api/file/
- [x] 15,421 Resource.fileUrl migrated to /api/file/
- [x] 15,324 Resource.thumbnailUrl migrated to /api/file/
- [x] Removed preconnect to Vercel Blob in root layout
- [x] New public proxy /api/file/[...key] (R2 → Vercel Blob fallback)

### Phase 2: Frontend compute (commits 9739d56..ee440e9)
- [x] All public pages on CF Workers
- [x] Admin pages all converted to D1
- [x] /enseignant/* space converted to D1
- [x] Auth flow converted to D1 raw SQL
- [x] API routes converted to D1
- [x] Prisma removed from active code paths

### Phase 3: Admin uploads (2026-09-07) — DONE
- [x] `concours-9eme/bulk-upload`: Vercel Blob → R2 (`uploadFile`)
- [x] `jotform-bulk-import`: Vercel Blob → R2
- [x] `jotform-migrate`: Vercel Blob → R2
- [x] `marouan-upload-large`: Vercel Blob → R2
- [x] `marouan-upload-url`: Vercel Blob → R2
- [x] `resource-overwrite`: Vercel Blob → R2 (also uses D1 for Resource update)
- [x] `tunisiecollege-import`: Vercel Blob → R2
- [x] `upload-thumbnail`: Vercel Blob → R2 (Python worker uses this)
- [x] `blob-cleanup`: Vercel Blob → R2 (uses `deleteFile`)

### Phase 4: Cron jobs (2026-09-07) — DONE
- [x] `cleanup-views`: now in wrangler.jsonc triggers (`0 3 * * *`)
- [x] `agent-poll`: now in worker-with-cache.js scheduled handler (was Vercel `0 */6 * * *`)
- [x] `nightly-cleanup`: now in wrangler.jsonc triggers (`0 3 * * *`)
- [x] `monitor-alerts`: now in worker-with-cache.js (every 5 min)
- [x] `cf-observability-sync`: now in worker-with-cache.js (every 5 min)
- [x] `db-sync`: DELETED (only managed Vercel env for Neon)
- [x] `vercel.json` crons: REMOVED

### Phase 5: Config files (2026-09-07) — DONE
- [x] `vercel.json`: crons removed (kept for headers cache only — can be deleted)
- [x] `package.json`: removed `@vercel/blob` dependency
- [x] `src/lib/origin.ts`: already clean (no VERCEL_URL)
- [x] `src/lib/storage.ts`: already R2-only (no IS_VERCEL check)

### Phase 6: Concours + Bac files (already done in 2026-08)
- [x] 257 concours files in R2 (`concours-9eme/*`)
- [x] 2,634 bac files in R2 (`bac/*`)
- [x] Served via `/api/concours-file/` proxy (manifest references may still show Vercel Blob URLs but files are in R2)

## 🛑 SHUTDOWN INSTRUCTIONS

### Pre-shutdown checklist
- [x] All admin uploads go to R2 (no Vercel Blob calls)
- [x] All crons in CF Worker triggers
- [x] No DATABASE_URL at runtime (only in build for prisma generate)
- [x] No `@vercel/blob` in code or dependencies
- [x] No `db-sync` route (was the only Neon-Vercel bridge)
- [x] DNS examanet.com + www → CF Worker (100::)
- [x] 100% of compute on CF Workers

### Vercel shutdown steps
1. Log into https://vercel.com/dashboard
2. Find project "examanet" (or "edutunisie")
3. Settings → Delete Project
4. Confirm with project name

Or via API (need Vercel token):
```bash
# List projects
curl -H "Authorization: Bearer $VERCEL_TOKEN" "https://api.vercel.com/v9/projects"

# Delete project
curl -X DELETE -H "Authorization: Bearer $VERCEL_TOKEN" "https://api.vercel.com/v9/projects/$PROJECT_ID"
```

### Neon shutdown steps
1. Log into https://console.neon.tech
2. Select project "examanet"
3. Settings → Delete Project
4. Confirm

Or via API (need Neon management key):
```bash
# List projects
curl -H "Authorization: Bearer $NEON_API_KEY" "https://console.neon.tech/api/v2/projects"

# Delete project
curl -X DELETE -H "Authorization: Bearer $NEON_API_KEY" "https://console.neon.tech/api/v2/projects/$PROJECT_ID"
```

## Note for next phase
After Vercel + Neon shutdown:
- GitLab repo can also be moved to a more local solution
- All CF Worker costs (D1 + R2 + Workers) will be the only bill
- Cost estimate: ~$10-15/month (mostly D1 reads at scale)
