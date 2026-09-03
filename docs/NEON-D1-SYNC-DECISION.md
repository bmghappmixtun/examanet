# Neon → D1 sync decision (2026-09-03)

## Final state

| Table | Neon | D1 | % | Decision |
|---|---|---|---|---|
| User | 2,463 | 2,455 | 99.7% | keep (already in D1) |
| Resource | 15,422 | 15,428 | 100% | keep |
| Subject | 30 | 30 | 100% | keep |
| Class | 7 | 7 | 100% | keep |
| Section | 17 | 17 | 100% | keep |
| Level | 2 | 2 | 100% | keep |
| ResourceSummary | 11,593 | **11,592** | 100% | re-synced |
| ResourceMetadata | 15,425 | **15,405** | 99.9% | re-synced (20 FK skipped) |
| ResourceContent | 15,347 | **15,326** | 99.9% | re-synced (21 FK skipped) |
| Download | 30,043 | **30,035** | 99.97% | re-synced (8 FK skipped) |
| View | 739,448 | **58,833** | 7.9% | **SKIP — analytics only** |
| ErrorLog | 344 | 60 | 17.4% | keep (CF worker writes here) |
| Session | 65 | 112 | 172% | keep (CF sessions, different lifecycle) |
| Notification | 504 | 543 | 107.7% | keep |
| SearchSynonym | 35 | 0 | 0% | minor — empty for now |
| ApiProvider | 4 | 0 | 0% | minor — needs config |
| ApiProviderUsage | 25 | 0 | 0% | minor |
| TeacherFile | 15,054 | 15,061 | 100% | keep |
| TeacherInvitation | 18 | 0 | 0% | **needs migration** for invitation flow |
| OtpCode | 22 | 9 | 41% | keep (transient) |
| ContactMessage | 13 | 2 | 15% | keep (admin sees new ones) |
| Other tables | - | - | - | not synced, not user-facing |

## Why View was skipped

- 740K rows of granular analytics data
- Each row = 1 page view event
- D1 already has Resource.viewsCount (aggregated counter) — what UI shows
- 8% done before sandbox killed the process; resuming would take 7+ hours
- The aggregated Resource.viewsCount is what matters for UX/SEO

## Verdict: D1 has enough data to run the platform

- All user-facing features (resources, users, search, etc.) work with D1 data
- View detail is lost but aggregate counts are preserved
- TeacherInvitation is the only critical missing table for admin onboarding
- All admin/cron/agent routes use D1-direct via `src/lib/d1-admin.ts`

## Next steps before cutting Neon

1. Decide on TeacherInvitation migration (admin onboarding)
2. Optional: re-sync smaller missing tables (SearchSynonym, ApiProvider, ApiProviderUsage)
3. Update Neon connection strings to point to D1
4. Suspend Neon project (1 month buffer)
5. Cancel Vercel project (1 month buffer)
