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
  params: Promise<{ numericId: string; slug: string }>;
}) {
  const { numericId: numericIdStr } = await params;
  const numericId = parseInt(numericIdStr, 10);
  
  // Default metadata for invalid IDs
  if (!numericIdStr || numericIdStr === 'undefined' || Number.isNaN(numericId) || numericId <= 0) {
    return { title: 'Professeur non trouvé' };
  }
  
  // Simple, fast metadata (no D1 calls in generateMetadata to avoid CPU timeout)
  // The actual teacher name and details are shown in the client component
  return {
    title: `Professeur #${numericId}`,
    description: `Découvrez le profil de ce professeur sur Examanet : cours, exercices, sujets et corrigés gratuits.`,
    alternates: {
      canonical: `https://examanet.com/professeurs/${numericId}`,
    },
    openGraph: {
      title: `Professeur #${numericId}`,
      description: `Profil professeur sur Examanet`,
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
      const nameFr = `${teacher.firstName || ''} ${teacher.lastName || ''}`.trim() || `Professeur #${numericId}`;
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
