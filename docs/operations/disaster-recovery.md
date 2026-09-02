# 🆘 Examanet — Disaster Recovery Plan

> Last updated: **July 9, 2026**
> Owner: Mehdi Boutiti (`boutiti.mehdi@gmail.com`)
> Severity levels: 🟢 low · 🟡 medium · 🔴 critical

This document is the runbook to follow when something breaks. Read the **TL;DR** first, then jump to the matching scenario.

---

## TL;DR — The 4 layers of backup

| Layer | What | Where | Coverage | Restore time |
|-------|------|-------|----------|--------------|
| **1. Code** | Source + builds | GitHub + Vercel | All deploys | < 1 min (1-click) |
| **2. Database** | Neon PITR | Neon (auto) | Last **7 days**, any point | < 5 min |
| **3. JSON dumps** | Daily DB export | GitHub Actions + `backups/db/` branch | 90 days rolling | 5-15 min |
| **4. Blob files** | Vercel Blob | Vercel (no off-site yet) | None | Manual upload |

**Code + DB together = 99% of what matters.** The 15,333 PDFs are the only irrecoverable piece today.

---

## 🟢 Scenario 1 — A deploy broke the UI

**Symptom:** Home page is broken / 500 errors / weird layout.

**Cause:** Bad code that passed build but breaks at runtime.

**Fix:** Rollback in Vercel (1 click)

```bash
# Option A: via Vercel dashboard
#   → https://vercel.com/bmghappmixtun/edutunisie/deployments
#   → Find last green deploy (✓)
#   → Menu → "Promote to Production"

# Option B: via Vercel CLI (if installed)
vercel rollback

# Option C: revert in Git
git revert HEAD
git push origin main
```

**Time:** < 1 minute

---

## 🟡 Scenario 2 — A migration broke the DB schema

**Symptom:** Prisma errors, app crashes on every page, errors like "column does not exist".

**Cause:** A bad `prisma migrate deploy` or `db push`.

**Fix:** Restore from Neon PITR (any point in last 7 days)

```bash
# 1. Go to Neon dashboard
#    → https://console.neon.tech/app/projects/ep-round-art-asyh88wq/branches
#
# 2. Find the affected branch
#
# 3. Click "Time Travel" / "Restore" → pick a timestamp BEFORE the bad migration
#
# 4. Neon creates a new branch with the restored data
#
# 5. Update DATABASE_URL in Vercel to point to the new branch
#
# 6. Verify the app, then either:
#    - Keep the restored branch and delete the broken one, OR
#    - Reset main to the restored branch
```

**Time:** 5-15 minutes

---

## 🟡 Scenario 3 — Vercel Blob is gone (region outage / accidental delete)

**Symptom:** All PDFs / images return 404. Resource detail pages show missing files.

**Cause:** Vercel storage incident or misconfigured cleanup script.

**Status:** **Covered by R2 backup if configured.** See [blob-r2-backup.md](./blob-r2-backup.md).

**Recovery from R2 (if configured):**
1. Verify R2 backup is intact: `node scripts/backup/blob-restore-r2.mjs --report`
2. Re-create Vercel Blob store: Vercel dashboard → Storage → Create new Blob
3. Update `BLOB_READ_WRITE_TOKEN` in Vercel env vars with the new store's token
4. Restore all files: `node scripts/backup/blob-restore-r2.mjs --restore-all` (~2-3h for 30K files)
5. Verify: `curl -I https://kmy1h6us8l7bg7bg.public.blob.vercel-storage.com/teacher-library/foo/bar.pdf` → 200

**Time:** 2-3 hours. Downtime depends on how fast you re-create the Vercel Blob store.

**Manual recovery (if R2 not yet set up):**
1. Check if any local copies exist: `find /workspace -name "*.pdf" | head`
2. Re-upload from source: JotForm submissions, teacher emails, original import scripts
3. Update `TeacherFile.fileUrl` in DB to new URLs

**Time:** Hours to days (depending on volume)

**Time:** Hours to days (depending on volume)

---

## 🟡 Scenario 4 — Neon project is gone (account lost / region dead)

**Symptom:** All DB queries fail with connection errors.

**Cause:** Neon account issue, expired token, region deleted.

**Fix:** Restore from JSON backup

```bash
# 1. Find the latest backup on the `backups/db` branch or GitHub Actions artifacts
#    → https://github.com/bmghappmixtun/edutunisie/actions/workflows/nightly-backup.yml
#    → Download the most recent artifact
#
# 2. Extract to local directory
mkdir -p backups/db/latest
cd backups/db/latest
# (unzip the artifact)
ls -la

# 3. Verify backup integrity
cat schema.json | head -30
# Should show all tables with row counts

# 4. Create a new Neon project
#    → https://console.neon.tech → New Project
#    → Copy the new DATABASE_URL

# 5. Update DATABASE_URL locally
#    → Edit .env.local with the new connection string
#    → Edit Vercel env vars with the new connection string

# 6. Run schema migration to create empty tables
npx prisma migrate deploy

# 7. Restore data
node scripts/backup/db-restore.mjs --dir=backups/db/latest --mode=upsert

# 8. Re-link blob storage
#    → Update BLOB_READ_WRITE_TOKEN if blobs are on a new store
#    → All TeacherFile.fileUrl values may need updating

# 9. Verify
node scripts/backup/env-check.mjs
npm run dev  # test locally
```

**Time:** 1-2 hours

---

## 🟢 Scenario 5 — Need to rollback a single bad record

**Symptom:** A specific user/resource/comment has wrong data, want to revert just that.

**Cause:** Botched import or admin error.

**Fix:** Use JSON backup to find the old value, update manually

```bash
# 1. Find the backup containing the record
#    (probably yesterday's dump in backups/db/YYYY-MM-DD/)

# 2. Search for the record
cat backups/db/2026-07-08/resource.json | jq '.[] | select(.id == "abc123")'

# 3. Apply manually via Prisma Studio
npx prisma studio
# → Find the record → paste the old values → Save
```

**Time:** 5-10 minutes

---

## 🟡 Scenario 6 — Suspicious activity / data leak

**Symptom:** Logs show weird patterns, admin account has unexpected changes, files are 404'ing, etc.

**Cause:** Compromised credentials, botched CI/CD, leaked env vars.

**Fix:** Security incident response
1. **Rotate all secrets immediately:**
   - Vercel tokens: https://vercel.com/account/tokens
   - GitHub PAT: https://github.com/settings/tokens
   - Neon password: Settings → Reset
   - Resend API key: https://resend.com/api-keys
   - OpenAI API key: https://platform.openai.com/api-keys
2. **Update env vars in Vercel** with new values
3. **Audit git history** for leaked secrets: `git log -p | grep -i "token\|secret\|password"`
4. **Check DB for new admin accounts**: `npx prisma studio` → User table
5. **Snapshot the current state** before any cleanup: `node scripts/backup/db-dump.mjs`
6. **Contact Mehdi** (`boutiti.mehdi@gmail.com`) if unsure

**Time:** 30-60 minutes

---

## Maintenance

### Daily (automated)
- ✅ GitHub Action `nightly-backup.yml` runs at 03:00 UTC
- ✅ Pushes JSON dump to `backups/db/` branch
- ✅ Uploads artifact (90-day retention)

### Weekly (manual, 5 min)
- Check GitHub Actions tab for backup failures
- Verify `backups/db/MANIFEST.json` is being updated

### Monthly (manual, 15 min)
- Test restore: download latest artifact, run `--dry-run` restore
- Review `backups/blob/YYYY-MM-DD/summary.json` for unexpected growth
- Verify Vercel deploys are succeeding

### Quarterly (manual, 1 hour)
- Full DR drill: pick a backup, restore to a temp Neon branch, verify app works
- Update this doc with any new scenarios encountered

---

## Contact

| Role | Person | Contact |
|------|--------|---------|
| Owner | Mehdi Boutiti | boutiti.mehdi@gmail.com |
| Tech | Mavis | (this assistant) |

---

## Appendix: Backup script index

| Script | Purpose | Where it runs |
|--------|---------|---------------|
| `scripts/backup/db-dump.mjs` | Dump all 26 tables to JSON | Manual + GitHub Action |
| `scripts/backup/blob-inventory-from-db.mjs` | List all blob URLs from DB | Manual |
| `scripts/backup/blob-inventory.mjs` | List blob URLs via Vercel API | Manual (needs `BLOB_READ_WRITE_TOKEN`) |
| `scripts/backup/env-vars-doc.mjs` | Document all env vars (redacted) | Manual |
| `scripts/backup/env-check.mjs` | Verify all required env vars set | Pre-deploy check |
| `scripts/backup/db-restore.mjs` | Restore DB from JSON dump | Emergency only |

---

## Related docs
- [env-vars.md](./env-vars.md) — Environment variables reference
- [../security-credential-exposure-incident.md](../security-credential-exposure-incident.md) — Past Neon credential leak
- [../architecture/decisions.md](../architecture/decisions.md) — Why we chose Neon + Vercel Blob
