// @ts-nocheck
// Admin page: pending resource edits (modifications proposed by teachers).
// 2026-09-07: Full D1 migration completed.
// Workflow: teachers re-upload a file for a PUBLISHED resource → Resource.editStatus
// becomes 'PENDING_EDIT_APPROVAL' + Resource.pendingEdit contains the proposed file.
// Admin approves → file is replaced + status reverts to PUBLISHED.
// Admin rejects → editStatus becomes 'EDIT_REJECTED' with reason.

import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import PendingEditsClient from '@/components/admin/PendingEditsClient';
import { CheckCircle2 } from 'lucide-react';

export const dynamic = 'force-dynamic';

async function getD1() {
  const { getCloudflareContext } = await import('@opennextjs/cloudflare');
  const ctx = await getCloudflareContext({ async: true });
  return (ctx as any).env.DB;
}

export default async function PendingEditsPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/connexion');
  if (user.role !== 'ADMIN') redirect('/');

  const db = await getD1();
  if (!db) {
    return (
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
        ⚠️ Base de données indisponible. Réessayez dans quelques instants.
      </div>
    );
  }

  // Pending edits (PENDING_EDIT_APPROVAL)
  const pendingRes = await db.prepare(`
    SELECT
      r.id, r.numericId, r.slug, r.title, r.type, r.status,
      r.editRequestedAt, r.editRequestedById,
      r.fileKey AS currentFileKey, r.fileUrl AS currentFileUrl,
      r.fileSize AS currentFileSize, r.pageCount AS currentPageCount,
      json_extract(r.pendingEdit, '$.fileKey') AS pendingFileKey,
      json_extract(r.pendingEdit, '$.fileUrl') AS pendingFileUrl,
      json_extract(r.pendingEdit, '$.fileSize') AS pendingFileSize,
      json_extract(r.pendingEdit, '$.pageCount') AS pendingPageCount,
      t.firstName AS teacherFirstName, t.lastName AS teacherLastName, t.email AS teacherEmail,
      req.firstName AS requesterFirstName, req.lastName AS requesterLastName, req.email AS requesterEmail,
      s.nameFr AS subjectNameFr, s.color AS subjectColor,
      c.nameFr AS classNameFr,
      sec.nameFr AS sectionNameFr
    FROM Resource r
    LEFT JOIN User t ON r.teacherId = t.id
    LEFT JOIN User req ON r.editRequestedById = req.id
    LEFT JOIN Subject s ON r.subjectId = s.id
    LEFT JOIN "Class" c ON r.classId = c.id
    LEFT JOIN Section sec ON r.sectionId = sec.id
    WHERE r.editStatus = 'PENDING_EDIT_APPROVAL'
    ORDER BY r.editRequestedAt DESC
    LIMIT 100
  `).all().catch((e: any) => {
    console.error('[editions] pending query error:', e);
    return { results: [] };
  });

  // Recently rejected (last 30 days)
  const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const rejectedRes = await db.prepare(`
    SELECT
      r.id, r.numericId, r.slug, r.title, r.type, r.status,
      r.editRequestedAt, r.editRequestedById,
      r.fileKey AS currentFileKey, r.fileUrl AS currentFileUrl,
      r.fileSize AS currentFileSize, r.pageCount AS currentPageCount,
      r.editRejectionReason,
      json_extract(r.pendingEdit, '$.fileKey') AS pendingFileKey,
      json_extract(r.pendingEdit, '$.fileUrl') AS pendingFileUrl,
      json_extract(r.pendingEdit, '$.fileSize') AS pendingFileSize,
      json_extract(r.pendingEdit, '$.pageCount') AS pendingPageCount,
      t.firstName AS teacherFirstName, t.lastName AS teacherLastName, t.email AS teacherEmail,
      req.firstName AS requesterFirstName, req.lastName AS requesterLastName, req.email AS requesterEmail,
      s.nameFr AS subjectNameFr, s.color AS subjectColor,
      c.nameFr AS classNameFr,
      sec.nameFr AS sectionNameFr
    FROM Resource r
    LEFT JOIN User t ON r.teacherId = t.id
    LEFT JOIN User req ON r.editRequestedById = req.id
    LEFT JOIN Subject s ON r.subjectId = s.id
    LEFT JOIN "Class" c ON r.classId = c.id
    LEFT JOIN Section sec ON r.sectionId = sec.id
    WHERE r.editStatus = 'EDIT_REJECTED' AND r.editReviewedAt > ?
    ORDER BY r.editReviewedAt DESC
    LIMIT 20
  `).bind(thirtyDaysAgo).all().catch((e: any) => {
    console.error('[editions] rejected query error:', e);
    return { results: [] };
  });

  // Normalize for client
  const pendingEdits = (pendingRes?.results || []).map((e: any) => ({
    id: e.id,
    numericId: e.numericId,
    slug: e.slug,
    title: e.title,
    type: e.type,
    status: e.status,
    editRequestedAt: e.editRequestedAt ? Number(e.editRequestedAt) : null,
    editRequestedById: e.editRequestedById,
    editRequestedByName:
      [e.requesterFirstName, e.requesterLastName].filter(Boolean).join(' ') || null,
    editRequestedByEmail: e.requesterEmail,
    teacherName: [e.teacherFirstName, e.teacherLastName].filter(Boolean).join(' ') || null,
    teacherEmail: e.teacherEmail,
    currentFileKey: e.currentFileKey,
    currentFileUrl: e.currentFileUrl,
    currentFileSize: e.currentFileSize ? Number(e.currentFileSize) : null,
    currentPageCount: e.currentPageCount ? Number(e.currentPageCount) : null,
    pendingFileKey: e.pendingFileKey,
    pendingFileUrl: e.pendingFileUrl,
    pendingFileSize: e.pendingFileSize ? Number(e.pendingFileSize) : null,
    pendingPageCount: e.pendingPageCount ? Number(e.pendingPageCount) : null,
    subjectNameFr: e.subjectNameFr,
    subjectColor: e.subjectColor,
    classNameFr: e.classNameFr,
    sectionNameFr: e.sectionNameFr,
  }));

  const recentlyRejected = (rejectedRes?.results || []).map((e: any) => ({
    id: e.id,
    numericId: e.numericId,
    slug: e.slug,
    title: e.title,
    type: e.type,
    status: e.status,
    editRequestedAt: e.editRequestedAt ? Number(e.editRequestedAt) : null,
    editRequestedById: e.editRequestedById,
    editRequestedByName:
      [e.requesterFirstName, e.requesterLastName].filter(Boolean).join(' ') || null,
    editRequestedByEmail: e.requesterEmail,
    teacherName: [e.teacherFirstName, e.teacherLastName].filter(Boolean).join(' ') || null,
    teacherEmail: e.teacherEmail,
    currentFileKey: e.currentFileKey,
    currentFileUrl: e.currentFileUrl,
    currentFileSize: e.currentFileSize ? Number(e.currentFileSize) : null,
    currentPageCount: e.currentPageCount ? Number(e.currentPageCount) : null,
    pendingFileKey: e.pendingFileKey,
    pendingFileUrl: e.pendingFileUrl,
    pendingFileSize: e.pendingFileSize ? Number(e.pendingFileSize) : null,
    pendingPageCount: e.pendingPageCount ? Number(e.pendingPageCount) : null,
    subjectNameFr: e.subjectNameFr,
    subjectColor: e.subjectColor,
    classNameFr: e.classNameFr,
    sectionNameFr: e.sectionNameFr,
  }));

  return (
    <PendingEditsClient
      pendingEdits={pendingEdits}
      recentlyRejected={recentlyRejected}
    />
  );
}
