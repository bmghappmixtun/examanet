# Security Policy — Examanet

## Reporting a Vulnerability

Email: boutiti.mehdi@gmail.com (admin owner)

For sensitive issues (API keys, tokens, credentials leaked in commits):
- **DO NOT** open a public GitHub issue
- Email directly with details
- Allow 24-48h for response before public disclosure

---

## 🔒 Incident Log

### 2026-09-17 — Jotform API Key Leak (RESOLVED)

**Severity**: HIGH  
**Vector**: GitHub public commit  
**Detection**: GitHub Secret Scanning alert → email to owner

**Timeline**:
- 2026-09-07 11:42 UTC: Key `****4dc1` committed to `bmghappmixtun/examanet` in `de42b0d97850b8e4dac15911c0a9b22f460e1f04` (Phase 9 R2 migration commit)
- 2026-09-08: GitHub secret scanning detected the key
- 2026-09-17 09:00 UTC: Owner received alert email
- 2026-09-17 ~09:10 UTC: Owner rotated the Jotform token + changed password
- 2026-09-17 ~09:30 UTC: Key scrubbed from current source (commits `0e5af25f`, `d755bc32`)
- 2026-09-17 ~10:00 UTC: Dev script `pull-jotform-devoirat.cjs` removed

**Root Cause**:
```js
// src/app/api/admin/jotform-bulk-import/route.ts (OLD)
const JOTFORM_KEY = process.env.JOTFORM_API_KEY || '7312267369dbfc1c06dab2cf7cba4dc1';
```
Fallback to hardcoded key when env var missing. Bad practice: secrets as code defaults.

**Secondary Issue**: One-off dev script `pull-jotform-devoirat.cjs` was accidentally committed (line 2: `const k = '7312267369dbfc1c06dab2cf7cba4dc1'`).

**Fixes Applied** (commits `0e5af25f` + `d755bc32`):
1. `route.ts`: Removed fallback, throws if env var missing
2. `pull-jotform-devoirat.cjs`: Deleted from repo

**History Purge**: NOT COMPLETED.
- Old commits (10 of them) still contain the leaked key in GitHub history
- Force-purging with `git filter-branch` would take ~4 hours for 3125 commits
- Decision: **DEPRECATED in favor of token rotation**
- The leaked key is now INVALID (rotated)
- GitHub will GC old unreachable commits eventually
- Manual cleanup: `git filter-branch --index-filter` can be run async if needed

**Lessons Learned**:
1. NEVER use `process.env.X || 'fallback-secret'` — fail loudly instead
2. Add `.env*` and dev scripts to `.gitignore` BEFORE first commit
3. Use GitHub branch protection requiring secret scanning pass
4. Audit commits with `gitleaks` or `trufflehog` pre-push
5. Document secret rotation procedures in SECURITY.md

**Action Items** (for future prevention):
- [x] Rotate leaked key
- [x] Remove fallback in code
- [x] Delete dev script
- [ ] (deferred) Run `git filter-branch` async to purge history (low priority since key rotated)
- [ ] Add `trufflehog` pre-commit hook to prevent future leaks
- [ ] Review all `process.env.X || 'fallback'` patterns in codebase

---

## Best Practices (Reminders)

### DO ✅
- Use `wrangler secret put NAME` for Cloudflare Workers secrets
- Use environment variables for ALL secrets
- Set `process.env.X` and FAIL LOUDLY if undefined
- Document secrets in 1Password or Bitwarden
- Rotate credentials every 90 days minimum
- Use fine-grained PATs with minimal scope

### DON'T ❌
- Hardcode secrets (even as fallbacks) in source code
- Commit `.env`, `.env.local`, `.env.production`
- Commit dev scripts that contain API keys
- Use `process.env.X || 'default-secret'`
- Share secrets in chat/email/screenshots
- Use classic PATs when fine-grained would work

---

## Secret Rotation Procedures

### Cloudflare Workers
```bash
# Set a new secret (interactively prompts for value)
npx wrangler secret put SECRET_NAME --config wrangler.prod.jsonc

# Verify (lists secret NAMES only, not values)
npx wrangler secret list --config wrangler.prod.jsonc

# Delete an old secret
npx wrangler secret delete SECRET_NAME --config wrangler.prod.jsonc
```

### Jotform
1. Login at https://www.jotform.com/myaccount/api
2. Delete the old API key
3. Click "Create New Key"
4. Save the new key in password manager (NOT in code)
5. Update wrangler secret: `npx wrangler secret put JOTFORM_API_KEY`
6. Redeploy worker

### GitHub PAT
1. Settings → Developer settings → Personal access tokens
2. "Revoke" on old token
3. "Generate new token" with minimal scopes
4. Update local git remotes
5. Update GitHub Actions secrets

