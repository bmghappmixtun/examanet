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
import { breadcrumbSchema, itemListSchema } from '@/lib/structured-data';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://examanet.com';

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
  // 2026-09-07: Inject breadcrumb + ItemList JSON-LD for SEO.
  // The subject name and top resources are fetched server-side (D1 direct)
  // so the schema is available on first paint, not after client hydration.
  const breadcrumbJsonLd = breadcrumbSchema([
    { name: 'Accueil', url: SITE_URL },
    { name: 'Matières', url: `${SITE_URL}/matieres` },
    { name: subjectSlug, url: `${SITE_URL}/matieres/${subjectSlug}` },
  ]);
  let itemListJsonLd: any = null;
  try {
    const { getCloudflareContext } = await import('@opennextjs/cloudflare');
    const ctx = await getCloudflareContext({ async: true });
    const db = (ctx as any).env.DB;
    const subj: any = await db.prepare(
      'SELECT id, nameFr, nameAr FROM Subject WHERE slug = ? LIMIT 1'
    ).bind(subjectSlug).first();
    if (subj) {
      const top: any = await db.prepare(
        "SELECT r.numericId, r.slug, r.title FROM Resource r WHERE r.subjectId = ? AND r.status = 'PUBLISHED' AND r.isHidden = 0 ORDER BY r.viewsCount DESC LIMIT 10"
      ).bind(subj.id).all();
      const items = (top?.results || []).map((r: any, i: number) => ({
        name: r.title,
        url: `${SITE_URL}/fr/ressources/${r.numericId}/${r.slug}`,
        position: i + 1,
      }));
      if (items.length > 0) {
        itemListJsonLd = {
          '@context': 'https://schema.org',
          '@type': 'ItemList',
          name: `Ressources populaires en ${subj.nameFr}`,
          url: `${SITE_URL}/matieres/${subjectSlug}`,
          numberOfItems: items.length,
          itemListElement: items.map((it: any) => ({
            '@type': 'ListItem',
            position: it.position,
            name: it.name,
            url: it.url,
          })),
        };
      }
    }
  } catch {
    // Don't fail the page on schema errors
  }
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />
      {itemListJsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListJsonLd) }}
        />
      )}
      <MatiereClient slug={subjectSlug} />
    </>
  );
}
