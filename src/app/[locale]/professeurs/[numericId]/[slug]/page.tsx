// @ts-nocheck
// 2026-08-28: /fr/professeurs/[numericId]/[slug] — TRUE client-only shim
// Server-side metadata for SEO + Client component for all data.

import TeacherDetailClient from '@/components/teachers/TeacherDetailClient';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ numericId: string; slug: string }>;
}) {
  const { numericId: numericIdStr } = await params;
  const numericId = parseInt(numericIdStr, 10);
  
  // Default metadata for invalid IDs
  if (!numericIdStr || numericIdStr === 'undefined' || Number.isNaN(numericId) || numericId <= 0) {
    return { title: 'Professeur non trouvé' };
  }
  
  // Best-effort metadata from D1 (don't fail if teacher doesn't exist - page will 404)
  let teacherName = 'Professeur';
  let teacherSchool: string | null = null;
  let teacherSubject: string | null = null;
  let resourceCount = 0;
  
  try {
    const { getCloudflareContext } = await import('@opennextjs/cloudflare');
    const ctx = await getCloudflareContext({ async: true });
    const db = (ctx as any).env.DB;
    
    const teacher: any = await db.prepare(
      `SELECT firstName, lastName, schoolName FROM User WHERE numericId = ? AND role = 'TEACHER' LIMIT 1`
    ).bind(numericId).first();
    
    if (teacher) {
      teacherName = [teacher.firstName, teacher.lastName].filter(Boolean).join(' ') || 'Professeur';
      teacherSchool = teacher.schoolName || null;
      
      // Get primary subject (most common)
      const topSubject: any = await db.prepare(
        `SELECT s.nameFr, COUNT(*) as c
        FROM Resource r
        INNER JOIN Subject s ON s.id = r.subjectId
        WHERE r.teacherId = (SELECT id FROM User WHERE numericId = ?) AND r.status = 'PUBLISHED'
        GROUP BY s.nameFr
        ORDER BY c DESC
        LIMIT 1`
      ).bind(numericId).first();
      teacherSubject = topSubject?.nameFr || null;
      
      const countRow: any = await db.prepare(
        `SELECT COUNT(*) as c FROM Resource
        WHERE teacherId = (SELECT id FROM User WHERE numericId = ?) AND status = 'PUBLISHED'`
      ).bind(numericId).first();
      resourceCount = Number(countRow?.c) || 0;
    }
  } catch (e) {
    // Ignore - use defaults
  }
  
  const title = teacherSchool
    ? `${teacherName} — ${teacherSchool}`
    : `${teacherName} — Professeur`;
  
  const description = teacherSubject
    ? `Découvrez les ${resourceCount} ressources de ${teacherName} (${teacherSubject}) sur Examanet : cours, exercices, sujets et corrigés.`
    : `Découvrez les ressources de ${teacherName} sur Examanet : cours, exercices, sujets et corrigés gratuits.`;
  
  return {
    title,
    description,
    alternates: {
      canonical: `https://examanet.com/professeurs/${numericId}`,
    },
    openGraph: {
      title,
      description,
      url: `https://examanet.com/professeurs/${numericId}`,
      siteName: 'Examanet',
      locale: 'fr_TN',
      type: 'profile',
    },
  };
}

export default async function Page({
  params,
}: {
  params: Promise<{ numericId: string; slug: string }>;
}) {
  // Await params on the server, then pass VALUES to client component
  // (cannot pass Promise/use() to client component - that fails during SSR)
  const { numericId, slug } = await params;
  return <TeacherDetailClient numericId={numericId} slug={slug} />;
}
