# Phase 9: Vercel + Neon Soft-Suspend COMPLETE (2026-09-07)

## ✅ Vercel project (edutunisie) — SUSPENDED

| Action | API | Status |
|--------|-----|--------|
| Disconnect GitHub link | DELETE /v1/projects/{id}/link | ✅ |
| Delete production deployment | DELETE /v13/deployments/dpl_7pru... | ✅ |
| VERCEL_TOKEN saved as CF Worker secret | wrangler secret put | ✅ |
| Plan downgrade (Pro → Hobby) | Dashboard only | ⏳ TODO |

**Vercel state**: Project exists in dashboard but no live deployment, no auto-deploys.

## ✅ Neon DB (edutunisie-db) — MINIMIZED

| Setting | Before | After | Effect |
|---------|--------|-------|--------|
| min_cu | 0.25 | 0.25 | Smallest possible |
| max_cu | 8 | 0.25 | Capped at min (no autoscale up) |
| suspend_timeout | 0 (never) | 300s | Auto-suspend after 5min idle |
| Compute state | idle | idle | Already not running |

**Both endpoints** (main + preview) configured identically.

**Cost**:
- Compute: ~$0/month (suspends after 5min idle, no traffic)
- Storage: 575 MB × $0.10/GB = ~$0.06/month
- **Total: <$0.10/month** (basically free, just data storage)

## 🎯 How I found the Neon project via Vercel

The key insight: **Vercel Storage store has `externalResourceId` = Neon project name**.

1. Listed Vercel stores: `GET /v1/storage/stores`
   → Found `store_0s3CGPu1NgFxS2UU` (edutunisie-db)
2. Got store details: `GET /v1/storage/stores/{id}`
   → Revealed `externalResourceId: little-silence-94324724` (Neon project slug)
3. Queried Neon directly: `GET https://console.neon.tech/api/v2/projects/little-silence-94324724`
   → Found `org_id: org-calm-snow-35151529` (Vercel-managed Neon org)
4. PATCH endpoint: `PATCH /api/v2/projects/{id}/endpoints/{id}` with `suspend_timeout_seconds: 300`

The `VERCEL_TOKEN` API key was failing before because it's scoped to a personal Neon account, but the Vercel Neon DB lives in a **Vercel-controlled org** (`org-calm-snow-35151529`). The trick: the user IS a member of this org (via Vercel), so the same API key can access it if you use the right org_id or fetch the project by name.

## 🛠 Manual cleanup remaining

1. **Vercel plan downgrade** (1 click, dashboard):
   - https://vercel.com/dashboard
   - Project: edutunisie → Settings → Billing → Downgrade to Hobby
   
   This stops the monthly Pro plan charge. The project stays in Hobby free tier (Vercel Hobby = free + project may auto-suspend if over quota, but never deletes).

2. **Optional: Rotate the Neon password** (in case you want to be extra safe):
   - Not strictly necessary since we're not using the DB anymore
   - But the password is in your Vercel env vars which you can remove

## 🔄 To RESTORE both

```bash
# 1. Re-link Vercel GitHub
curl -X POST -H "Authorization: Bearer $VERCEL_TOKEN" -H "Content-Type: application/json" \
  -d '{"type":"github","repo":"bmghappmixtun/edutunisie","productionBranch":"main"}' \
  "https://api.vercel.com/v1/projects/prj_tTEX1jjkXZo7XcCyFH6IU6DxuI0B/link"

# 2. Trigger new Vercel deployment
curl -X POST -H "Authorization: Bearer $VERCEL_TOKEN" \
  "https://api.vercel.com/v13/deployments?projectId=prj_tTEX1jjkXZo7XcCyFH6IU6DxuI0B"

# 3. Scale Neon back up
curl -X PATCH -H "Authorization: Bearer $NEON_KEY" -H "Content-Type: application/json" \
  -d '{"endpoint":{"autoscaling_limit_min_cu":0.25,"autoscaling_limit_max_cu":8,"suspend_timeout_seconds":0}}' \
  "https://console.neon.tech/api/v2/projects/little-silence-94324724/endpoints/ep-morning-salad-asfgyfxf"
```
