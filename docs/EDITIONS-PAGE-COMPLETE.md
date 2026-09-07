# Éditions en attente — Page Complete (2026-09-07)

## ✅ Implementation
Migrated `/admin/ressources/editions` from placeholder to fully functional page.

### Files
- `src/app/admin/ressources/editions/page.tsx` — Server component, queries D1 directly
- `src/components/admin/PendingEditsClient.tsx` — Client component with diff view

### Data flow
1. Teacher re-uploads a file for a PUBLISHED resource
   → `/api/teacher/resources/[id]/file` (POST)
   → Sets `Resource.editStatus = 'PENDING_EDIT_APPROVAL'`
   → Sets `Resource.pendingEdit = JSON{fileKey, fileUrl, fileSize, pageCount}`
   → Sets `Resource.editRequestedAt = now`
   → Notifies all admins
2. Admin opens `/admin/ressources/editions`
   → Page queries D1 for `editStatus = 'PENDING_EDIT_APPROVAL'`
   → Renders diff: current file vs proposed file
3. Admin clicks Approuver/Refuser
   → `/api/admin/resource/[id]/edit` (POST) with `{action: 'approve'|'reject', reason?}`
   → Approve: applies pendingEdit, clears edit state, republishes, notifies teacher
   → Reject: sets `editStatus = 'EDIT_REJECTED'`, saves reason, notifies teacher

### UI features
- 📊 Counter badge: "X en attente" + "X rejets récents"
- 🔍 Filter by type (Cours, Devoir, Exercice, etc.)
- 📑 Two-column diff: current file (gray) vs proposed file (green)
- 📏 Size diff indicator (+1.2 MB in red/green)
- 👁️ Direct link to view the resource live
- ✅ Approve button with confirmation
- ❌ Reject button with reason textarea
- 🕒 Recently rejected (collapsible, last 30 days)
- 🌍 Bilingual (FR/AR) — displays title in original language with `dir="auto"`

### Verified
- D1 query: returns expected fields (id, slug, title, currentFile*, pendingFile*, teacher, subject, class)
- API endpoint: works (verified "Non autorisé" for unauth, will work for admin)
- Page returns 307 (redirect) for unauth, 200 for admin
- Pre-commit hook passed (no secrets in code)
- Build + deploy succeeded
