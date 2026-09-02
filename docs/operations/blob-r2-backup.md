# ☁️ Examanet — Blob Backup to Cloudflare R2

> Last updated: **July 9, 2026**
> Status: Scripts ready, R2 account setup needed.

This document explains how to set up off-site backup of all Vercel Blob files to Cloudflare R2.

---

## Why R2?

| | Vercel Blob | Cloudflare R2 |
|---|---|---|
| **Egress** | $$ paid per GB | **$0 free** |
| **Storage** | $0.15/GB/mo | $0.015/GB/mo (10× cheaper) |
| **API compatibility** | Custom | **S3-compatible** (use AWS SDK) |
| **Risk** | Single region, no off-site | Multi-region, durable |

For 30GB of data, R2 costs ~$0.45/month vs Vercel Blob ~$4.50/month.

---

## Setup (one-time, ~10 minutes)

### Step 1 — Create Cloudflare account

1. Go to https://dash.cloudflare.com/sign-up
2. Sign up (free, no credit card needed for R2 free tier)
3. Verify email

### Step 2 — Enable R2

1. In Cloudflare dashboard, click **R2** in the left sidebar
2. Click **Purchase R2 Plan** → **Get started free** ($0/month for first 10GB)
3. Add credit card only if you'll exceed 10GB (we have 30GB → $0.45/mo)

### Step 3 — Create bucket

1. Click **Create bucket**
2. Name: `examanet-blob-backup`
3. Location: **Automatic** (recommended) or pick closest to you (EU/Africa)
4. **Don't** enable "Public bucket" — we'll use API access only
5. Click **Create bucket**

### Step 4 — Create API token

1. R2 dashboard → **Manage R2 API Tokens** (top right)
2. Click **Create API token**
3. Settings:
   - Name: `examanet-backup-token`
   - Permissions: **Object Read & Write**
   - TTL: leave empty (no expiration)
   - Bucket: **Apply to specific bucket** → `examanet-blob-backup`
4. Click **Create API token**
5. **Copy the values shown** (you can only see them once):
   - `Access Key ID` → `R2_ACCESS_KEY_ID`
   - `Secret Access Key` → `R2_SECRET_ACCESS_KEY`
   - `Endpoint` → `R2_ENDPOINT` (or use default with `R2_ACCOUNT_ID`)

### Step 5 — Get Account ID

1. R2 dashboard → top right → click your account name
2. Copy the **Account ID** (32-char hex string) → `R2_ACCOUNT_ID`

### Step 6 — Add to `.env.local`

Add to `/workspace/edutunisie/.env.local`:

```bash
# Cloudflare R2 backup (off-site mirror of Vercel Blob)
R2_ACCOUNT_ID=your_account_id_here
R2_ACCESS_KEY_ID=your_r2_access_key
R2_SECRET_ACCESS_KEY=your_r2_secret_key
R2_BUCKET=examanet-blob-backup
# Optional: custom endpoint (otherwise auto-constructed)
# R2_ENDPOINT=https://your_account_id.r2.cloudflarestorage.com
```

### Step 7 — Test

```bash
cd /workspace/edutunisie
node scripts/backup/blob-restore-r2.mjs --report
```

Should show: `Total files: 0, Total size: 0.0 MB, $0.0000/month`

If yes, R2 is connected. Now run the first sync:

```bash
# Dry-run first to see what would happen
node scripts/backup/blob-sync-r2.mjs --dry-run

# Real sync (will take 1-2 hours for full 30GB)
node scripts/backup/blob-sync-r2.mjs
```

---

## Automation (GitHub Action)

Once manual sync works, set up the daily GitHub Action:

1. **Add R2 secrets to GitHub** (Settings → Secrets and variables → Actions):
   - `R2_ACCOUNT_ID`
   - `R2_ACCESS_KEY_ID`
   - `R2_SECRET_ACCESS_KEY`
   - `R2_BUCKET`

2. **Push the workflow file** (it's in `.github/workflows/blob-sync-r2.yml` but blocked by PAT scope):
   - Open GitHub UI → repo → `.github/workflows/`
   - Click "Add file" → upload `blob-sync-r2.yml`
   - Or: drag & drop the file from your local copy

3. **The action runs daily at 04:00 UTC**, only uploads new/changed files (delta detection by key match).

---

## Scripts reference

### `blob-sync-r2.mjs` — Upload Vercel Blob → R2

```bash
# Full sync (first time, ~1-2h)
node scripts/backup/blob-sync-r2.mjs

# Daily delta sync (~minutes, only new files)
node scripts/backup/blob-sync-r2.mjs

# Dry-run (report only, no uploads)
node scripts/backup/blob-sync-r2.mjs --dry-run

# Only sync a specific folder
node scripts/backup/blob-sync-r2.mjs --prefix=teacher-library/

# Use a saved inventory file instead of querying DB
node scripts/backup/blob-sync-r2.mjs --from-inventory=backups/blob/2026-07-09/inventory.json
```

**Delta detection**: Compares URLs in DB vs keys in R2. Files already in R2 are skipped. **Re-running is fast (only new files)**.

**Output**: Manifest in `backups/blob/sync-YYYY-MM-DD.json` with stats.

### `blob-restore-r2.mjs` — Restore from R2

```bash
# List all files in R2
node scripts/backup/blob-restore-r2.mjs --list

# Show storage cost report
node scripts/backup/blob-restore-r2.mjs --report

# Restore one file to Vercel Blob
node scripts/backup/blob-restore-r2.mjs --key=teacher-library/foo/bar.pdf

# Restore all files to Vercel Blob
node scripts/backup/blob-restore-r2.mjs --restore-all

# Generate a temporary public R2 URL (no re-upload needed)
node scripts/backup/blob-restore-r2.mjs --key=... --public-url
```

**How restore works**:
1. Downloads file from R2
2. Re-uploads to Vercel Blob (with new URL)
3. Updates `TeacherFile.fileUrl` / `TeacherFile.pdfUrl` in DB

**Time for full restore**: ~2-3 hours for 30K files.

---

## Cost breakdown

*Measured from `TeacherFile.fileSize` + `pdfSize` in DB on 2026-07-09:*

| Item | Real data | Cost |
|------|-----------|------|
| Total files | 30,556 (15,278 source + 15,278 PDF) | — |
| Total size | **13.64 GB** (avg 468 KB/file) | — |
| Storage (10 GB free + 3.64 GB × $0.015) | — | **$0.055/month** |
| Class A ops (15K PUTs × $4.50/M) | — | **$0.068/month** |
| Class B ops (HEAD/GET × $0.36/M) | — | **$0.010/month** |
| Egress (downloads) | — | **$0 (free!)** |
| **TOTAL** | — | **~$0.13/month** |

Vs Vercel Blob: $5-10/month for same volume (paid egress, single region).

---

## Disaster recovery

If Vercel Blob dies (region outage, accidental delete):

```bash
# 1. Verify R2 backup is intact
node scripts/backup/blob-restore-r2.mjs --report
# → "Total files: 30556, Total size: 30GB"

# 2. Re-create Vercel Blob store
#    → Vercel dashboard → Storage → Create new Blob store
#    → Copy the new BLOB_READ_WRITE_TOKEN to .env.local + Vercel

# 3. Restore all files
node scripts/backup/blob-restore-r2.mjs --restore-all
# → Downloads from R2, re-uploads to Vercel Blob, updates DB

# 4. Verify
curl -I "https://kmy1h6us8l7bg7bg.public.blob.vercel-storage.com/teacher-library/foo/bar.pdf"
# → 200 OK

# 5. App should work normally — fileUrl in DB has new URLs from Vercel Blob
```

**Time**: 2-3 hours. Downtime: depends on how fast you re-create the Vercel Blob store.

---

## FAQ

**Q: Is R2 as reliable as Vercel Blob?**
A: More reliable. R2 stores data across multiple regions automatically (Erasure Coding with 99.999999999% durability). Vercel Blob is single-region.

**Q: What if I exceed the free tier?**
A: R2 has $0/month plan with 10GB free. Above that, $0.015/GB/mo. We have 30GB = $0.45/mo, still very cheap.

**Q: Can I delete Vercel Blob and use only R2?**
A: Yes, but you'd need to update `TeacherFile.fileUrl` to point to R2 public URLs (requires R2 bucket to be public, which has implications). Easiest: keep Vercel Blob as primary, R2 as backup.

**Q: What if R2 is down?**
A: The sync script will fail but won't affect the app (Vercel Blob still serves). Just retry the sync later.

**Q: How often should I sync?**
A: Daily is fine. The script is fast (only delta uploads). The GitHub Action does this automatically.

---

## Related

- [disaster-recovery.md](./disaster-recovery.md) — Full DR runbook (Scenario 3: Vercel Blob gone)
- [env-vars.md](./env-vars.md) — Environment variables reference
