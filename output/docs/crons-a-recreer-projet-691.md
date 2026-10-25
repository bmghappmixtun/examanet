# Prompts des 4 crons Examanet — à recréer dans le projet « Plateforme éducative »

## Pourquoi

Les 4 tâches existent et tournent, mais sur `project_id: "0"` (workspace par défaut)
au lieu de **691 = « Plateforme éducative »** → invisibles dans ta sidebar (« No tasks »).

| Ancien task_id | cron_name | Schedule | État |
|---|---|---|---|
| `420093321810042` | examanet-nightly-error-cleanup | `15 2 * * *` | ✅ actif |
| `427848628686913` | neon-monthly-cost-monitor | `0 9 1 * *` | ✅ actif |
| `419078338625738` | seo-backfill-reminder | `0 10 14 7 *` | ✅ actif |
| `426125193814127` | arabe-kp-batch-monitor | `*/3 * * * *` | ⏸ pause |

`cron_update` n'expose **pas** de champ `project` → seul `cron_create` le permet.

---

## 🥇 Voie rapide : nouvelle conversation

Ouvre un **nouveau chat** depuis le projet « Plateforme éducative » et écris :

> recrée les 4 crons Examanet

Une conversation neuve n'a pas de tâche planifiée → `cron_create` passe. Et en omettant
le champ `project`, la tâche hérite automatiquement du projet courant (691).

---

## 🥈 Voie manuelle (si tu préfères l'UI)

Crée 4 tâches dans le projet « Plateforme éducative » avec ces paramètres,
puis supprime les 4 anciennes ci-dessus.

| | 1 | 2 | 3 | 4 |
|---|---|---|---|---|
| **Nom** | examanet-nightly-error-cleanup | neon-monthly-cost-monitor | seo-backfill-reminder | arabe-kp-batch-monitor |
| **Schedule** | `15 2 * * *` | `0 9 1 * *` | `0 10 14 7 *` | `*/3 * * * *` |
| **Timezone** | Europe/Paris | Europe/Paris | Europe/Paris | Europe/Paris |
| **Actif** | ✅ oui | ✅ oui | ✅ oui | ⏸ non |
| **Conversation** | nouvelle | nouvelle | nouvelle | nouvelle |

---

# PROMPT 1 — examanet-nightly-error-cleanup

```
Examanet nightly error cleanup (3h15 Tunisia = 2h15 UTC).

# Goal
Fetch the 7d error digest, fix what's safe, defer the rest, push 1 commit max, smoke-test prod.

# Steps

## 0. Pre-flight (mandatory)
- Run session-start: `curl -sS https://examanet-prod.examanet-poc.workers.dev/api/agent/session-start`
- If digest is empty → reply "no errors to clean" and exit. Stop.
- Mark errors seen: set `seenBySession=1` for the digest rows.

## 1. Fetch digest
`curl -sS https://examanet.com/api/agent/nightly-digest | head -300`

## 2. Classify each group

AUTO-FIXABLE ONLY if ALL of these hold:
- Root cause is identifiable at a SPECIFIC file+line in /workspace/edutunisie/src/
- The message is NOT minified garbage (single-letter names like `j is not a function` → DEFERRED unless you can point to the exact line)
- The fix is ≤30 lines, single file, no schema/env/auth changes

DEFERRED (no fix):
- User errors (expired session, bad params, validation)
- External service failures (Discord, Stripe, Resend, OpenAI, Sentry, Vercel, CF)
- Minified errors without a clear stack → DEFERRED + flag for source map fix
- Anything you are not 100% sure you can fix without regression

## 3. Safety rails (HARD — never violate)

### Files blacklist — NEVER patch:
- `lib/auth*`, `lib/auth.ts`, `middleware.ts`
- `drizzle-migrations/**`, `prisma/**`
- `next.config.js`, `wrangler*.jsonc`, `package.json` (except dev deps)
- `scripts/**` (cron deployment infra)
- `src/app/api/auth/**`, `src/app/api/admin/auth/**`
- Anything under `src/app/api/cron/**` (self-modification risk)
- `agent_memory*`, `MEMORY.md` (system files)

### Files whitelist (safe to patch):
- `src/components/**`, `src/app/**/page.tsx`, `src/app/**/_client.tsx`
- `src/lib/utils*`, `src/lib/structured-data*`, `src/lib/i18n*`
- `src/lib/validation*` (schemas, not auth logic)

### If a fix needs a blacklisted file → DEFER and document why.

### Quantity limits
- MAX 1 commit per night
- MAX 30 lines changed per commit
- If 2+ groups would fix → pick the highest-count one, defer the rest

### Build verification (mandatory)
- `npx next build` MUST succeed before commit
- TypeScript errors that pre-existed are OK (363+ known), but NEW errors fail the build

### Git safety
- Worktree workflow mandatory: branch `fix/nightly-cleanup-YYYY-MM-DD`
- NEVER force push, NEVER push to main directly
- Commit, push branch, fast-forward merge to main from a separate main worktree

## 4. Post-deploy smoke test (mandatory)

After the merge to main is pushed and GitHub Actions deploys:
- Wait 60s for CF Worker to propagate
- Curl these URLs with timeout=10 each, must return HTTP 2xx or 3xx:
  - `https://examanet.com/fr` (home)
  - `https://examanet.com/fr/ressources` (FilterShell)
  - `https://examanet.com/api/agent/nightly-digest` (API health)
- If ANY returns 5xx OR a smoke-test fails TWICE in a row → ROLLBACK:
  - `git revert HEAD --no-edit && git push origin main`
  - Document rollback in the report.

## 5. Report

Send to root session:
- Errors seen: {count} groups / {count} events
- Auto-fixed: {count} (file list + commit SHA)
- Deferred: {count} (brief why per group)
- Smoke test: PASS / FAIL / ROLLBACK
- Save report to `/workspace/nightly-YYYY-MM-DD.md`
- Discord webhook: `DISCORD_WEBHOOK_URL` env (if not in sandbox, save locally + tell user to forward)

## 6. Discipline

- Total runtime budget: 20 min. If you exceed it, defer everything and report why.
- Never make 2 patches in one night.
- When in doubt: DEFER. The next nightly cycle will catch it again.
- If the same group has been deferred 3+ nights in a row → escalate to user via communicate (not auto-fix).

# Stack
- Cloudflare Workers + D1
- GitHub Actions deploys via `cloudflare/wrangler-action` after `npm run build:cf`
- Source of truth: github.com/bmghappmixtun/examanet
- Errors flow: client → /api/errors/log → Discord (CF Worker edge)
- Admin email `boutiti.mehdi@gmail.com` MUST NEVER be deleted (hard rule for any cleanup touching User table)
```

---

# PROMPT 2 — neon-monthly-cost-monitor

```
Examanet Neon cost monitoring (1er du mois à 9h Paris = 8h UTC).

Steps:
1. cd /workspace/edutunisie && source .env.local
2. Run: python3 /workspace/monitor_neon.py
3. Analyze the output:
   - Check pooler_enabled = true, suspend_timeout_seconds = 300
   - Compare total cost to last month (in /workspace/neon_cost_history.txt if exists)
   - Identify any anomaly (cost spike >+30%, new slow queries, many connections)
4. If anomaly, report to user via communicate
5. Always append a summary to /workspace/neon_cost_history.txt with date + total cost
6. Report back to root session

The script output covers: endpoint config, consumption (CU-hours, $), connections,
top 10 slow queries, recent start/suspend cycles.
```

---

# PROMPT 3 — seo-backfill-reminder

```
User asked on 2026-07-13 to be reminded about the SEO backfill plan. The plan was:
1) Dry-run on 100 resources, 2) If OK, batched script (50/batch, 1s pause) to backfill
tags for 15,333 resources using autoGenerateTagsEnriched, 3) Idempotent (skip if tags
exist), 4) Backup mode (preserve vs override). The enriched auto-tagger is built and
tested (commit 7ffa7eb, tag stable-2026-07-13-enriched-auto-tagger). Ask user if they
want to proceed with dry-run now.
```

> ⚠️ Ce rappel pointe sur un plan de **juillet 2026**. Si tu as avancé depuis, mets-le à jour
> ou supprime-le — sinon il va te relancer avec un plan périmé.

---

# PROMPT 4 — arabe-kp-batch-monitor *(garder en pause)*

```
Check the OpenAI batch for Arabe KP and apply results when ready.

Batch ID stored in /workspace/arabe_kp_batch_id.txt (new batch: batch_6a734b48f9308190ba277e703d8ad174)

Steps:
1. cd /workspace/edutunisie && source .env.local
2. Check batch status: python3 /workspace/check_arabe_batch.py
3. If status is 'completed', run: python3 /workspace/apply_arabe_batch_v2.py
4. If status is 'failed' or stuck >30 min in 'in_progress', report to user via communicate
5. If still in progress, just print status (no action needed)
6. When batch is complete AND applied, disable this cron via mavis cron update --enabled=false
7. Report back to root session with final state

Max 10 runs (30 min) - if still in progress, report status to user.
```

---

## ⚠️ Piège à éviter

**Supprime les 4 ANCIENNES seulement APRÈS avoir vérifié que les nouvelles sont créées.**
Sinon tu te retrouves sans aucune tâche.

Le risque réel : les 2 crons actifs (nightly 02h15 + neon le 1er) feraient **2 commits
en double** sur `main` si les deux versions coexistent.