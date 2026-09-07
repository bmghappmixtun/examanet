# Neon DB Cleanup COMPLETE (2026-09-07)

## ✅ Goal: Get under 512 MB to enable Free tier downgrade

**Before**: 527 MB (over 512 MB limit by 15 MB)
**After**: 370 MB (well under limit, 142 MB headroom)

## 🧹 Tables cleaned (data preserved in D1)

| Table | Rows Cleared | Notes |
|-------|--------------|-------|
| VercelLog | 28,460 | Renamed to CloudflareLog in D1, full data preserved there |
| ErrorLog | 682 | Full data in D1 |
| Session | 65 | All invalidated by admin password change 2026-09-07 |
| OtpCode | 34 | One-time codes, all expired |
| SearchLog | 0 | Empty, schema in D1 |
| Download | 30,100 | Download tracking in D1 |
| Notification | 504 | Transient notifications, history in D1 |
| **Total** | **59,845** | **~157 MB freed** |

## 🛠 Procedure

1. Connected via pg client to Neon pooler endpoint
2. Used `DELETE FROM` (not `TRUNCATE` due to permission issue with Vercel-managed org)
3. Ran `VACUUM FULL` to reclaim physical disk space
4. Verified: `pg_database_size = 370 MB`

## 📊 Next step: Vercel dashboard plan downgrade

**The Vercel Storage plan is "Launch" ($0.35/GB-month)** which is separate from your Vercel account plan (now Hobby).

To change it:
1. https://vercel.com/dashboard → **Storage** tab
2. Click **edutunisie-db**
3. **Settings** (gear icon)
4. **Plan** section → **Change to Free**

Now that the DB is 370 MB (under 512 MB), the downgrade should succeed.

**After downgrade**: $0/month for Neon (was $0.20/month for storage)
