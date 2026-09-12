// @ts-nocheck
// 2026-08-28: /fr/professeurs/[numericId]/[slug] — TRUE client-only shim
// Server-side metadata for SEO + Client component for all data.

import TeacherDetailClient from '@/components/teachers/TeacherDetailClient';
import { breadcrumbSchema, personSchema } from '@/lib/structured-data';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://examanet.com';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; numericId: string; slug: string }>;
}) {
  const { locale, numericId: numericIdStr } = await params;
  const numericId = parseInt(numericIdStr, 10);
  
  // Default metadata for invalid IDs
  if (!numericIdStr || numericIdStr === 'undefined' || Number.isNaN(numericId) || numericId <= 0) {
    return { title: 'Professeur non trouvé' };
  }
  
  // 2026-09-12: Use locale-aware canonical. Was hardcoded /professeurs/X
  // without /fr/ or /ar/ prefix, which caused Google to flag the canonical
  // as pointing to a "different page with correct canonical".
  const localePrefix = locale === 'ar' ? '/ar' : '/fr';
  
  return {
    title: `Professeur #${numericId}`,
    description: `Découvrez le profil de ce professeur sur Examanet : cours, exercices, sujets et corrigés gratuits.`,
    alternates: {
      canonical: `${SITE_URL}${localePrefix}/professeurs/${numericId}`,
    },
    openGraph: {
      title: `Professeur #${numericId}`,
      description: `Profil professeur sur Examanet`,
      url: `${SITE_URL}${localePrefix}/professeurs/${numericId}`,
      siteName: 'Examanet',
      locale: locale === 'ar' ? 'ar_TN' : 'fr_TN',
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
  // 2026-09-07: Inject breadcrumb + Person JSON-LD for SEO.
  // The teacher name is fetched server-side (D1 direct) so the schema is
  // available on first paint and Google can index the Person profile.
  const breadcrumbJsonLd = breadcrumbSchema([
    { name: 'Accueil', url: SITE_URL },
    { name: 'Professeurs', url: `${SITE_URL}/professeurs` },
    { name: `#${numericId}`, url: `${SITE_URL}/professeurs/${numericId}/${slug}` },
  ]);
  let personJsonLd: any = null;
  try {
    const { getCloudflareContext } = await import('@opennextjs/cloudflare');
    const ctx = await getCloudflareContext({ async: true });
    const db = (ctx as any).env.DB;
    const teacher: any = await db.prepare(
      "SELECT id, firstName, lastName, firstNameAr, lastNameAr, schoolName, schoolNameAr, bio, isVerifiedTeacher FROM User WHERE numericId = ? AND role = 'TEACHER' LIMIT 1"
    ).bind(numericId).first();
    if (teacher) {
      // 2026-09-10: Fallback to AR name if FR is missing (some teachers only have AR).
      const nameFr = `${teacher.firstName || ''} ${teacher.lastName || ''}`.trim()
        || `${teacher.firstNameAr || ''} ${teacher.lastNameAr || ''}`.trim()
        || `Professeur #${numericId}`;
      const profileUrl = `${SITE_URL}/professeurs/${numericId}/${slug}`;
      personJsonLd = {
        '@context': 'https://schema.org',
        '@type': 'Person',
        '@id': `${profileUrl}#person`,
        name: nameFr,
        ...(teacher.firstNameAr || teacher.lastNameAr
          ? { alternateName: `${teacher.firstNameAr || ''} ${teacher.lastNameAr || ''}`.trim() }
          : {}),
        url: profileUrl,
        jobTitle: 'Enseignant',
        affiliation: { '@id': `${SITE_URL}#organization` },
        worksFor: teacher.schoolName
          ? { '@type': 'EducationalOrganization', name: teacher.schoolName }
          : { '@type': 'EducationalOrganization', name: 'Examanet' },
        ...(teacher.bio ? { description: teacher.bio } : {}),
        knowsAbout: teacher.schoolNameAr ? [teacher.schoolNameAr] : undefined,
      };
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
      {personJsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(personJsonLd) }}
        />
      )}
      <TeacherDetailClient numericId={numericId} slug={slug} />
    </>
  );
}
