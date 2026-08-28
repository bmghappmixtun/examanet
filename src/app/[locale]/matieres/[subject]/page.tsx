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

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ subject: string }> }) {
  const { subject: subjectSlug } = await params;
  try {
    const { getCloudflareContext } = await import('@opennextjs/cloudflare');
    const ctx = await getCloudflareContext({ async: true });
    const db = (ctx as any).env.DB;
    const subject: any = await db.prepare(
      'SELECT nameFr, nameAr FROM Subject WHERE slug = ? LIMIT 1'
    ).bind(subjectSlug).first();
    if (!subject) {
      return { title: 'Matière non trouvée' };
    }
    return {
      title: `${subject.nameFr} — Cours, Devoirs et Exercices | Examanet`,
      description: `Ressources en ${subject.nameFr} pour le système éducatif tunisien : cours, exercices, sujets de bac et corrigés.`,
      alternates: {
        canonical: `https://examanet.com/matieres/${subjectSlug}`,
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
