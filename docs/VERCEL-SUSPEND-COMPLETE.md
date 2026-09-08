# Vercel Project: SUSPENDED (2026-09-07)

## ✅ What's been done via API

1. **GitHub link disconnected** — no more auto-deploys from commits
2. **Production deployment deleted** — no more live traffic on vercel.app
3. **VERCEL_TOKEN saved as CF Worker secret** — for future API access
4. **Project kept in dashboard** — per your "don't delete permanently" instruction

## 📊 Current state

- **examanet.com**: DNS still on CF Worker (100::) — NO CHANGE
- **www.examanet.com**: DNS still on CF Worker — NO CHANGE
- **edutunisie.vercel.app**: Vercel deployment DELETED — URL is now dead
- **Vercel project**: Still exists in dashboard but no production deployment
- **Vercel plan**: Still on current plan (Pro/Launch/whatever) — needs manual downgrade

## 🛑 To fully stop billing, do this manually

1. Go to https://vercel.com/dashboard
2. Find project "edutunisie"
3. **Settings** → **Billing**
4. Click **"Downgrade to Hobby"** (or "Remove payment method" for faster effect)

This is dashboard-only because Vercel requires a confirmation flow that isn't exposed via API.

## 💰 Current monthly cost (estimated)

- Vercel Pro: ~$20/month (until you downgrade)
- Total: ~$20/month

After downgrade to Hobby:
- $0 (Vercel project stays under free tier)

## 🔄 To RESTORE the project

```bash
# 1. Re-link GitHub
curl -X POST \
  -H "Authorization: Bearer $VERCEL_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"type":"github","repo":"bmghappmixtun/edutunisie","productionBranch":"main"}' \
  "https://api.vercel.com/v1/projects/$PROJECT_ID/link"

# 2. Trigger a new deployment
curl -X POST \
  -H "Authorization: Bearer $VERCEL_TOKEN" \
  "https://api.vercel.com/v13/deployments?projectId=$PROJECT_ID"

# 3. Or re-upgrade to Pro via dashboard
```

Then Vercel will deploy and serve traffic again (but your DNS still points to CF Worker).
