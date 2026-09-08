# New Student Notifications — Fix (2026-09-08)

## 🐛 Bug
New student registrations were NOT triggering admin notifications.

The system only notified admins when a **teacher** registered (via `notifyAdminsNewTeacher`).
Students registered silently — admins only knew about them by visiting `/admin/utilisateurs`.

## ✅ Fix
1. Added `notifyAdminsNewStudent()` function in `src/lib/admin-notify.ts`
2. Updated `src/app/api/auth/register/route.ts` to call it for `role === 'STUDENT'`

### Notification shape
- **Type**: `new_student_signed_up`
- **Title**: 🎓 Nouvel élève inscrit
- **Body**: `{FirstName} {LastName} ({email}) — {classLevel} · {school} · {governorate}`
- **Link**: `/admin/utilisateurs?role=STUDENT`
- **Delivery**: in-app only (no email — too high volume)

## 🗃 Backfill (pending CF API recovery)
A backfill script was created at `scripts/phase9/backfill-student-notifs-d1.mjs` to
insert notifications for the 11 students who registered since 2026-08-30.
- This script will run once the CF API is back online
- It uses real D1 user IDs (retrieved at runtime)

## 🧪 Verification
After deploy:
1. New student registration → admin sees notification badge in header
2. Notification click → /admin/utilisateurs?role=STUDENT (filtered)
3. Backfill script inserts 11 historical notifications for past students

## 📝 Related
- Existing: `notifyAdminsNewTeacher()` for teacher signups
- Existing: `notifyAdminsTeacherActivated()` for email verification
- Existing: `notifyAdminsNewResource()` for new content
- NEW: `notifyAdminsNewStudent()` for student signups
