# Cloudflare Migration — Status 2026-08-23

## ✅ Completed
- Step 0: Cleanup POC + docs
- Step 1: Decision — Free plan (3 MB) with bundle surgery
- Step 2: R2 prod bucket `examanet-pdf-prod` created
- Step 3: Hyperdrive `examanet-neon` → unpooled Neon endpoint
- **Step 4 (Blob backup)**: ✅ COMPLETE — 17 004 unique files / 7.6 GB in R2

## 📊 Backup Results (2026-08-23 09:54 UTC)
- Total URLs in DB: 30 108 (15 054 fileUrl + 15 054 pdfUrl)
- Distinct URLs: 18 344 (11 764 fileUrl === pdfUrl overlap)
- Uploaded to R2: 17 004 unique keys / 7.6 GB
- Errors: 1 343 (orphaned Vercel Blob refs - safe to ignore)
- Duration: 19.6 minutes (1178 sec)
- Throughput: ~36 files/sec avg
- **Manifest**: `backups/blob/sync-2026-08-23.json`

## ❌ Not Possible
- **Sippy** (incremental migration) — Vercel Blob is NOT S3-compatible.
  Sippy only supports AWS S3 and Google Cloud Storage.

## 📋 Next Steps
- **Step 5 (CF Images)**: Configure `next.config.js` to use custom loader
  for CF Images (replaces `next/image`).
- **Step 6 (CF Secrets)**: Run `scripts/setup-cf-secrets.sh` after
  `wrangler login --device`.
- **Step 7 (Prod worker)**: Build clean prod worker on `examanet-prod`.
- **Step 8 (Split traffic)**: Cloudflare Load Balancer or DNS-level
  traffic split (Vercel 90% / CF 10%).

## ⚠️ Decisions Needed
- **Strategy after backup**:
  - Use R2 as primary for new uploads (write to R2 instead of Vercel Blob)
  - OR keep Vercel Blob as primary (read-through to R2 fallback)
- **When to cutover**: Q1 2027 (per migration plan)
- **next-auth vs better-auth**: Keep next-auth (user decision 2026-08-23)

## 🔐 Security
- NEXTAUTH_SECRET, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET are
  in Vercel dashboard, not in .env.local. Need to be added to
  .env.local or passed via env to setup-cf-secrets.sh.

## 💰 Cost Projection
- Vercel: $22-32/mo
- Cloudflare (post-migration): $5-7/mo (75% cheaper, 100% on egress)
- R2 storage: 7.6 GB × $0.015/GB = $0.11/mo
- R2 egress: $0 (free)
