# Orphan Users Synced (2026-09-07)

## 🚨 Issue Discovered

After Phase 8 D1 migration and Phase 9 Vercel+Neon suspend, 6 users who registered
during the transition period (2026-08-30 to 2026-09-03) were stuck in Neon
without being mirrored to D1. They couldn't log in via the CF Worker.

## 🔍 Root Cause

Timeline of the data flow:
- **2026-08-30**: Phase 8 D1 migration completed (D1 became source of truth for new writes)
- **2026-08-30 to 2026-09-03**: Some users registered via the still-active Vercel deployment (Prisma → Neon)
- **2026-09-06**: DNS swap to CF Worker (D1 only)
- **2026-09-07**: Vercel project soft-suspended

The 6 users registered between DNS swap prep and DNS swap were:
- Created via Prisma (Vercel) → written to Neon
- D1 was already the new source of truth, so they were NOT replicated
- After DNS swap, they were invisible to the CF Worker auth flow

## ✅ Fix Applied

Synced 6 orphan users from Neon → D1 with full data preservation:
- id, email, passwordHash (login works)
- firstName, lastName
- role (STUDENT/TEACHER)
- status (PENDING_OTP/ACTIVE/PENDING_FILE_VERIFICATION)
- emailVerifiedAt (preserved)
- slug, numericId

### Synced users

| numId | email | role | status | created |
|-------|-------|------|--------|---------|
| 2580 | zouabions@gmail.com | STUDENT | PENDING_OTP | 2026-08-30 |
| 2581 | youssefouni615@gmail.com | STUDENT | ACTIVE | 2026-08-30 |
| 2582 | kraiemharoun459@gmail.com | STUDENT | PENDING_OTP | 2026-08-31 |
| 2585 | mezzizouheir@yahoo.fr | TEACHER | PENDING_FILE_VERIFICATION | 2026-09-02 |
| 2586 | othmanritej420@gmail.com | STUDENT | ACTIVE | 2026-09-02 |
| 2587 | majd.lefi@gmail.com | STUDENT | ACTIVE | 2026-09-03 |

## 🔒 Prevention

To prevent future sync gaps:
- Phase 9 is now complete: Vercel is paused, no more writes can go to Neon
- D1 is the single source of truth for all future registrations
- For new edge cases, the `scripts/phase9/find-missing-users.mjs` script can detect drift

## 📊 Counts After Sync

- D1: 2466 users (was 2460)
- Neon: 2466 users
- Difference: 0 ✓
