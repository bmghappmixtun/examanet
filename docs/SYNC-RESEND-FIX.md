# Sync Resend Bug Fix (2026-09-07)

## 🐛 Bug
Clicking "Sync Resend" in the admin → Invitations profs page returns "0 invitations synchronisées" even when there are invitations to sync.

## 🔍 Root Cause
In `src/lib/d1-admin.ts`, the `buildWhere()` function failed to handle Prisma's `{ not: null }` syntax correctly.

The Prisma-style filter:
```js
where: { resendMessageId: { not: null } }
```

Was being translated to:
```sql
resendMessageId != NULL
```

In SQL three-valued logic, `col != NULL` is **always NULL** (not TRUE), so the WHERE clause matched **zero rows**.

The fix:
```ts
} else if (op === 'not') {
  if (opVal === null) {
    parts.push(`${col} IS NOT NULL`);  // ✓
  } else {
    parts.push(`${col} != ?`);  // existing behavior
    values.push(toDbValue(opVal));
  }
}
```

## 📊 Impact
This bug affected the only place in the codebase that used `{ not: null }`:
- `src/app/api/admin/invitations/sync-delivery/route.ts:29`

The route was supposed to find up to 50 invitations with `resendMessageId` set, but it was finding 0 every time, so no sync ever happened.

## ✅ Fix
Updated `src/lib/d1-admin.ts` to handle `not: null` as `IS NOT NULL`.

## 🧪 Verification
After the fix:
- Query `{ resendMessageId: { not: null } }` generates `resendMessageId IS NOT NULL`
- D1 has 20 TeacherInvitation records, 20 with `resendMessageId` set
- Sync should now find and process these invitations
