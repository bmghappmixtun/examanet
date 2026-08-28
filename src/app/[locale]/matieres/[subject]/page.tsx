// @ts-nocheck
// 2026-08-28: Matiere subject page — TRUE client-only shim.
//
// The server component does NOTHING but render a client component. This avoids
// the getCloudflareContext() race condition in the OpenNext/Next.js render
// pipeline, which was causing 500 errors on CF Workers (the original 598-line
// page used many complex prisma queries that the shim didn't fully support).
//
// All data fetching happens client-side via /api/matieres/[slug]/data, which
// uses D1 directly with safeQuery() (each query has its own try/catch).
//
// SEO is preserved via generateMetadata() that also uses D1 directly.

import MatiereClient from '@/components/matieres/MatiereClient';
import { getSubjectConfig } from '@/lib/subjects.config';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ subject: string }> }) {
  const { subject: subjectSlug } = await params;
  try {
    const { getCloudflareContext } = await import('@opennextjs/cloudflare');
    const ctx = await getCloudflareContext({ async: true });
    const db = (ctx as any).env.DB;

    // Subject info
    const subject: any = await db.prepare(
      'SELECT id, nameFr, nameAr, color FROM Subject WHERE slug = ? LIMIT 1'
    ).bind(subjectSlug).first();
    if (!subject) {
      return { title: 'Matière non trouvée' };
    }

    // Count for description
    const countRow: any = await db.prepare(
      "SELECT COUNT(*) as c FROM Resource WHERE subjectId = ? AND status = 'PUBLISHED'"
    ).bind(subject.id).first();
    const totalCount = countRow?.c || 0;

    const cfg = getSubjectConfig(subjectSlug);

    // Vercel-style description
    const description = cfg?.seo?.descriptionFr 
      || `${totalCount}+ ressources en ${subject.nameFr} pour le système éducatif tunisien. Cours, exercices, sujets de bac et corrigés. 100% gratuit.`;

    return {
      title: `${subject.nameFr} — Cours, Devoirs et Exercices gratuits`,
      description,
      keywords: [
        `cours ${subjectSlug} tunisie`,
        `bac ${subjectSlug}`,
        subject.nameFr.toLowerCase(),
        `${subject.nameFr.toLowerCase()} tunisie`,
        `${subject.nameFr.toLowerCase()} gratuit`,
        `${subject.nameFr.toLowerCase()} bac`,
      ],
      alternates: {
        canonical: `https://examanet.com/matieres/${subjectSlug}`,
        languages: {
          'fr-TN': `https://examanet.com/matieres/${subjectSlug}`,
          'ar-TN': `https://examanet.com/ar/matieres/${subjectSlug}`,
        },
      },
      openGraph: {
        title: `${subject.nameFr} — Cours, Devoirs et Exercices gratuits`,
        description,
        url: `https://examanet.com/matieres/${subjectSlug}`,
        siteName: 'Examanet',
        locale: 'fr_TN',
        type: 'website',
        images: [
          {
            url: `https://examanet.com/api/og/subject/${subjectSlug}`,
            width: 1200,
            height: 630,
            alt: `${subject.nameFr} — Examanet`,
          },
        ],
      },
      twitter: {
        card: 'summary_large_image',
        title: `${subject.nameFr} — Cours, Devoirs et Exercices gratuits`,
        description,
        images: [`https://examanet.com/api/og/subject/${subjectSlug}`],
      },
    };
  } catch (e) {
    return {
      title: 'Matière — Examanet',
      description: 'Ressources éducatives tunisiennes gratuites.',
    };
  }
}

export default async function Page({
  params,
}: {
  params: Promise<{ subject: string }>;
}) {
  const { subject: subjectSlug } = await params;
  return <MatiereClient slug={subjectSlug} />;
}
