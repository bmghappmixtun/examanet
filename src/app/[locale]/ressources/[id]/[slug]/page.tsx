// @ts-nocheck
// 2026-08-27: Resource detail page — TRUE client-only shim.
//
// The server component does NOTHING but render a client component. This is
// the only way to avoid the getCloudflareContext() race condition in the
// OpenNext/Next.js render pipeline, which was causing 1101 errors.
//
// All data fetching happens client-side via /api/ressources/[id]/detail,
// which uses D1 directly (no getCloudflareContext in the render path).

import ResourceDetailClient from '@/components/resources/ResourceDetailClient';

export const dynamic = 'force-dynamic';

// 2026-09-12: Switched from static `metadata` to `generateMetadata` so we can
// include a locale-aware canonical + UNIQUE meta description per resource.
// Before this, every resource page had the same generic description, which
// Bing Webmaster Tools flagged as "94 pages with identical meta descriptions".
//
// generateMetadata runs BEFORE the page renders, so we can safely query D1
// (the client-only shim pattern only affects the page component itself).
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; id: string; slug: string }>;
}) {
  const { locale, id, slug } = await params;
  const numericId = parseInt(id, 10);
  const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://examanet.com';
  const localePrefix = locale === 'ar' ? '/ar' : '/fr';
  const decodedSlug = (() => {
    try { return decodeURIComponent(slug); } catch { return slug; }
  })();
  const canonicalUrl = Number.isFinite(numericId) && numericId > 0
    ? `${SITE_URL}${localePrefix}/ressources/${numericId}/${decodedSlug}`
    : `${SITE_URL}${localePrefix}/ressources`;

  // Fallback title/description (when D1 query fails or resource is missing)
  const fallbackTitle = 'Ressource pédagogique — Examanet';
  const fallbackDesc = 'Cours, exercices, sujets de bac et corrigés gratuits sur Examanet, la plateforme pédagogique tunisienne.';

  if (!Number.isFinite(numericId) || numericId <= 0) {
    return {
      title: fallbackTitle,
      description: fallbackDesc,
      robots: { index: true, follow: true },
      alternates: { canonical: canonicalUrl },
      openGraph: { title: fallbackTitle, description: fallbackDesc, locale: locale === 'ar' ? 'ar_TN' : 'fr_TN', type: 'article' },
    };
  }

  // Query D1 for the resource so we can build UNIQUE title + description
  let title = fallbackTitle;
  let description = fallbackDesc;
  let keywords: string[] = [];
  try {
    const { getCloudflareContext } = await import('@opennextjs/cloudflare');
    const ctx = await getCloudflareContext({ async: true });
    const db = (ctx as any).env?.DB;
    if (db) {
      const r: any = await db.prepare(`
        SELECT r.title, r.description, r.summary, r.type, r.tags,
               s.nameFr as subjectNameFr, s.nameAr as subjectNameAr,
               cl.nameFr as classNameFr, lv.nameFr as levelNameFr
        FROM Resource r
        LEFT JOIN Subject s ON r.subjectId = s.id
        LEFT JOIN "Class" cl ON r.classId = cl.id
        LEFT JOIN Level lv ON cl.levelId = lv.id
        WHERE r.numericId = ? AND r.status = 'PUBLISHED' AND r.isHidden = 0
        LIMIT 1
      `).bind(numericId).first().catch(() => null);
      
      if (r) {
        // Build UNIQUE title: include subject + level
        const subjectFr = r.subjectNameFr || '';
        const levelFr = r.levelNameFr || r.classNameFr || '';
        const typeFr = r.type || 'Ressource';
        title = `${r.title} — ${subjectFr} ${levelFr}`.trim().slice(0, 65);
        
        // Build UNIQUE description: title + subject + level + summary/desc
        const baseDesc = (r.description || r.summary || '').slice(0, 200);
        if (baseDesc) {
          description = `${baseDesc} — ${subjectFr} ${levelFr}, ${typeFr.toLowerCase()} gratuit sur Examanet.`.slice(0, 200);
        } else {
          description = `${r.title} — ${subjectFr} ${levelFr}, ${typeFr.toLowerCase()} gratuit sur Examanet pour les élèves tunisiens.`.slice(0, 200);
        }
        
        // Build keywords array
        keywords = [
          subjectFr,
          levelFr,
          typeFr,
          'Tunisie',
          'examanet',
          'gratuit',
          r.tags?.split(',').map((t: string) => t.trim()).filter(Boolean) || [],
        ].flat().filter(Boolean).slice(0, 10);
      }
    }
  } catch (e) {
    // Silent fallback
  }

  return {
    title,
    description,
    keywords: keywords.length > 0 ? keywords.join(', ') : undefined,
    robots: { index: true, follow: true },
    alternates: { canonical: canonicalUrl },
    openGraph: {
      title,
      description,
      locale: locale === 'ar' ? 'ar_TN' : 'fr_TN',
      type: 'article',
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
    },
  };
}

export default function Page({
  params,
}: {
  params: Promise<{ id: string; slug: string }>;
}) {
  return <ResourceDetailPageAsync params={params} />;
}

// Async wrapper to await params before passing to client component
async function ResourceDetailPageAsync({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; slug: string }>;
  searchParams: Promise<{ newdesign?: string }>;
}) {
  const { id, slug } = await params;
  const searchParamsObj = await searchParams;
  const numericId = parseInt(id, 10);
  if (isNaN(numericId)) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-slate-900">Ressource non trouvée</h1>
        </div>
      </div>
    );
  }
  // Decode URL-encoded slugs (Arabic chars, etc.)
  let decodedSlug = slug;
  try {
    decodedSlug = decodeURIComponent(slug);
  } catch {
    // Keep as-is if decode fails
  }

  // 2026-09-12: Server-rendered JSON-LD for SEO crawlers that don't run JS.
  // Bing Webmaster Tools reported many pages without proper Schema.org data.
  // generateMetadata is server-side, so we generate JSON-LD here too.
  let jsonLdScript: string | null = null;
  if (Number.isFinite(numericId) && numericId > 0) {
    try {
      const { getCloudflareContext } = await import('@opennextjs/cloudflare');
      const ctx = await getCloudflareContext({ async: true });
      const db = (ctx as any).env?.DB;
      if (db) {
        const r: any = await db.prepare(`
          SELECT r.title, r.description, r.summary, r.type, r.language,
                 s.nameFr as subjectNameFr, cl.nameFr as classNameFr, lv.nameFr as levelNameFr,
                 r.publishedAt, r.createdAt, r.updatedAt
          FROM Resource r
          LEFT JOIN Subject s ON r.subjectId = s.id
          LEFT JOIN "Class" cl ON r.classId = cl.id
          LEFT JOIN Level lv ON cl.levelId = lv.id
          WHERE r.numericId = ? AND r.status = 'PUBLISHED' AND r.isHidden = 0
          LIMIT 1
        `).bind(numericId).first().catch(() => null);
        
        if (r) {
          const localePrefix = (await params).locale === 'ar' ? '/ar' : '/fr';
          const resourceUrl = `https://examanet.com${localePrefix}/ressources/${numericId}/${decodedSlug}`;
          const cleanDesc = ((r.description || r.summary || '')).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200);
          
          // LearningResource schema (Course is a subtype, but LearningResource is more semantic)
          const jsonLd = {
            '@context': 'https://schema.org',
            '@type': 'LearningResource',
            name: r.title,
            description: cleanDesc || `${r.title} — Ressource pédagogique gratuite`,
            url: resourceUrl,
            inLanguage: r.language || 'fr',
            educationalLevel: r.levelNameFr || r.classNameFr || '',
            learningResourceType: r.type || 'Lesson',
            isAccessibleForFree: true,
            provider: { '@type': 'Organization', name: 'Examanet', url: 'https://examanet.com' },
            about: r.subjectNameFr || 'Éducation',
            datePublished: r.publishedAt ? new Date(r.publishedAt).toISOString() : undefined,
            dateModified: r.updatedAt ? new Date(r.updatedAt).toISOString() : undefined,
            isPartOf: { '@type': 'WebSite', name: 'Examanet', url: 'https://examanet.com' },
          };
          // BreadcrumbList schema
          const breadcrumbJsonLd = {
            '@context': 'https://schema.org',
            '@type': 'BreadcrumbList',
            itemListElement: [
              { '@type': 'ListItem', position: 1, name: 'Accueil', item: 'https://examanet.com' },
              { '@type': 'ListItem', position: 2, name: 'Ressources', item: 'https://examanet.com/fr/ressources' },
              { '@type': 'ListItem', position: 3, name: r.subjectNameFr || '', item: `https://examanet.com/fr/matieres/${r.subjectNameFr?.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-')}` },
              { '@type': 'ListItem', position: 4, name: r.title, item: resourceUrl },
            ],
          };
          
          jsonLdScript = JSON.stringify([jsonLd, breadcrumbJsonLd]);
        }
      }
    } catch (e) {
      // Silent fallback
    }
  }

  // 2026-09-13: Added opt-in flag for the NEW DESIGN 2027 preview.
  // When ?newdesign=1 is in the URL, render the new design via NewDesign2027Client.
  // When the flag is not present, fall back to the existing ResourceDetailClient.
  // This lets us A/B test on real resource URLs without breaking anything.
  if (searchParamsObj?.newdesign === '1') {
    const NewDesignClient = require('@/app/[locale]/newdesign2027/NewDesign2027Client').default;
    return <NewDesignClient numericId={numericId} />;
  }

  return (
    <>
      {jsonLdScript && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: jsonLdScript }}
        />
      )}
      <ResourceDetailClient numericId={numericId} slug={decodedSlug} />
    </>
  );
}
