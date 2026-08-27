// @ts-nocheck
import { notFound, permanentRedirect } from 'next/navigation';
import { Link } from '@/i18n/navigation';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';
import { fetchResourceDetail } from '@/lib/resource-detail-fetcher';
import { getTechMeta } from '@/lib/techologie-meta';
import ResourceActions from '@/components/resources/ResourceActions';
// PDFViewer is lazy-loaded via LazyPDFViewer (~90 KB gzipped saved on initial
// load). The full react-pdf + pdfjs-dist bundle was the biggest chunk on the
// resource page (2026-07-30 audit). See src/components/resources/LazyPDFViewer.tsx
// for rationale.
import LazyPDFViewer from '@/components/resources/LazyPDFViewer';
import RatingSection from '@/components/resources/RatingSection';
import CommentsSection from '@/components/resources/CommentsSection';
import ResourceInfoPanel from '@/components/resources/ResourceInfoPanel';
import AiContentSection from '@/components/resources/AiContentSection';
import AiExerciseOverview from '@/components/resources/AiExerciseOverview';
import ResourceScribdHeader from '@/components/resources/ResourceScribdHeader';
import { getPaletteForSubject } from '@/lib/ai-palettes';
// NOTE: getPaletteForSubject is kept for future use but currently no consumer
// in this file (the "Sujets abordés" section was removed 2026-08-02 since
// "Sujet général" replaced it).
import { formatNumber, RESOURCE_TYPE_LABELS, HOMEWORK_SUBTYPE_LABELS, timeAgo } from '@/lib/utils';
import { isArabic, splitArabicSubject } from '@/lib/text-utils';
import { courseSchema, breadcrumbSchema } from '@/lib/structured-data';

// Tiny helper for the PDF viewer placeholder file-size label.
function humanFileSize(bytes: number): string {
  if (!bytes || bytes < 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
import {
  Eye,
  Download,
  MessageCircle,
  Star,
  FileText,
  ChevronRight,
  CheckCircle2,
  GraduationCap,
  Wrench,
  Building2,
  Target,
} from 'lucide-react';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string; slug: string }>;
}) {
  const { id: rawId, slug: rawSlug } = await params;
  // The numericId is the stable identifier; the slug is purely cosmetic / SEO
  const numericId = parseInt(rawId, 10);
  if (isNaN(numericId)) {
    return { title: 'Ressource non trouvée' };
  }
  // Same URL-decode fix as the page (Next.js doesn't auto-decode non-ASCII slugs)
  let slug: string;
  try {
    slug = decodeURIComponent(rawSlug);
  } catch {
    slug = rawSlug;
  }
  const resource = await prisma.resource.findUnique({
    where: { numericId },
    include: { subject: true, class: true, teacher: true, metadata: true, content: true },
  });
  if (!resource) return { title: 'Ressource non trouvée' };

  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://examanet.com';
  // Strip HTML tags from description (AI summaries may contain <strong>/<ul>)
  const stripHtml = (s: string) => s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const rawDescription = resource.description ||
    `${resource.title} — Ressource pédagogique gratuite${resource.subject ? ' en ' + resource.subject.nameFr : ''}${resource.class ? ' pour ' + resource.class.nameFr : ''} sur Examanet Tunisie.`;
  const description = stripHtml(rawDescription);
  // The AI-extracted الموضوع العام is one of the strongest long-tail signals
  // for educational queries — surface it in the meta description so it appears
  // in the SERP snippet (Google displays the first ~155 chars).
  const generalSubject = (resource.metadata?.generalSubject || '').trim() || null;
  const seoDescription = generalSubject
    ? `${generalSubject}. ${description}`.slice(0, 160)
    : description.slice(0, 160);

  return {
    title: resource.title,
    description: seoDescription,
    keywords: (() => {
      const tagList = resource.tags
        ? resource.tags
            .split(',')
            .map((t: string) => t.trim())
            .filter(Boolean)
        : [];
      const auto = [
        resource.subject?.nameFr,
        resource.class?.nameFr,
        resource.type,
        'Tunisie',
        'examanet',
      ].filter(Boolean) as string[];
      // The general subject is the most specific topic — put it FIRST in the
      // keyword list so search engines weight it as the primary subject.
      const head = generalSubject ? [generalSubject] : [];
      return Array.from(new Set([...head, ...tagList, ...auto])).slice(0, 15);
    })(),
    alternates: {
      canonical: `${baseUrl}/ressources/${resource.numericId}/${resource.slug}`,
      languages: {
        'fr-TN': `${baseUrl}/ressources/${resource.numericId}/${resource.slug}`,
        'ar-TN': `${baseUrl}/ar/ressources/${resource.numericId}/${resource.slug}`,
        'x-default': `${baseUrl}/ressources/${resource.numericId}/${resource.slug}`,
      },
    },
    openGraph: {
      title: resource.title,
      description: seoDescription,
      url: `${baseUrl}/ressources/${resource.numericId}/${resource.slug}`,
      siteName: 'Examanet',
      locale: 'fr_TN',
      type: 'article',
      // article:tag = Facebook/LinkedIn tags (helps distribution)
      ...(resource.tags
        ? {
            tags: resource.tags
              .split(',')
              .map((t: string) => t.trim())
              .filter(Boolean),
          }
        : {}),
      images: [
        {
          url: `${baseUrl}/api/og/resource/${resource.numericId}`,
          width: 1200,
          height: 630,
          alt: resource.title,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title: resource.title,
      description: seoDescription,
      images: [`${baseUrl}/api/og/resource/${resource.numericId}`],
    },
  };
}

export default async function ResourcePage({
  params,
}: {
  params: Promise<{ id: string; slug: string }>;
}) {
  const { id: rawId, slug: rawSlug } = await params;
  // SECURITY/UX: Next.js does NOT auto-decode non-ASCII chars in [slug] params
  // (e.g. Arabic slugs arrive as '%D9%81...' percent-encoded). Decode manually
  // so Prisma can find the resource by its real slug.
  // The numericId is the stable identifier; the slug is purely cosmetic / SEO.
  const numericId = parseInt(rawId, 10);
  if (isNaN(numericId)) notFound();
  let slug: string;
  try {
    slug = decodeURIComponent(rawSlug);
  } catch {
    slug = rawSlug;
  }
  // Handle the 'no-slug' fallback used by search results: redirect to the canonical URL
  if (slug === 'no-slug') {
    // Defer to the resource lookup below to get the real slug, then redirect.
    // We can't redirect here because we don't have the resource yet. The lookup below
    // will use numericId and find the real slug, then we render normally.
  }
  // getCurrentUser is unstable on CF Workers; default to null on error
  let userSession: any = null;
  try {
    userSession = await getCurrentUser();
  } catch (e) {
    // Ignore - anonymous user
  }
  // 2026-08-27: prisma-compat on CF Workers throws 1101 ~50% of the time
  // on this complex nested-include query. Try prisma first (works when it
  // doesn't throw), fall back to the D1-based helper if it fails.
  let resource: any = null;
  let aggregateRating: any = null;
  try {
    resource = await prisma.resource.findUnique({
      where: { numericId },
      include: {
        subject: true,
        class: { include: { level: true } },
        section: true,
        teacher: true,
        ratings: { include: { user: { select: { firstName: true, lastName: true } } } },
        comments: {
          where: { parentId: null },
          include: { user: { select: { firstName: true, lastName: true, avatarUrl: true } } },
          orderBy: { createdAt: 'desc' },
        },
        metadata: true,
        aiSummary: true,
        content: true,
      },
    });
  } catch (e) {
    // Fall back to D1-based fetcher
    try {
      const detail = await fetchResourceDetail(numericId);
      if (detail) {
        resource = detail.resource;
        // Compute aggregate rating from the ratings array
        const ratings = detail.ratings;
        aggregateRating = ratings.length > 0
          ? {
              ratingCount: ratings.length,
              ratingValue: Math.round((ratings.reduce((s: number, r: any) => s + r.stars, 0) / ratings.length) * 10) / 10,
            }
          : null;
      }
    } catch (e2) {
      // Both approaches failed
      notFound();
    }
  }

  // Aggregate ratings for JSON-LD (already computed if from D1 fallback, otherwise compute now)
  const ratings = resource?.ratings ?? [];
  if (aggregateRating === null) {
    aggregateRating = ratings.length > 0
      ? {
          ratingCount: ratings.length,
          ratingValue:
            Math.round((ratings.reduce((s, r) => s + r.stars, 0) / ratings.length) * 10) / 10,
        }
      : null;
  }
  if (!resource) notFound();
  // 301 redirect to canonical slug when the requested slug is outdated
  // (titles get rebuilt periodically; this preserves SEO equity from old links).
  if (slug !== resource.slug) {
    permanentRedirect(`/ressources/${resource.numericId}/${resource.slug}`);
  }
  // PUBLISHED resources are fully public. ARCHIVED ones still load (so users
  // following old links / SEO see a friendly message instead of a 404), but
  // we skip the body (no PDF, no view tracking) below. DRAFT/PENDING/REJECTED
  // stay private — only owner/admin can view.
  if (resource.status !== 'PUBLISHED' && resource.status !== 'ARCHIVED') {
    if (!userSession || (userSession.id !== resource.teacherId && userSession.role !== 'ADMIN')) {
      notFound();
    }
  }

  const isArchived = resource.status === 'ARCHIVED';
  const canViewBody = !isArchived || (userSession && (userSession.id === resource.teacherId || userSession.role === 'ADMIN'));

  // Replace the blob URL with our proxy URL so the file is always served from examanet.com
  // (the user never sees the Vercel Blob URL). Skipped for archived resources
  // because we don't want bots/casual visitors tracking views on dead links.
  if (canViewBody) {
    resource.fileUrl = `/api/resources/${resource.numericId}/download`;

    // Track view (prisma throws intermittently on CF; non-critical if it fails)
    try {
      await prisma.view.create({ data: { resourceId: resource.id, ipAddress: 'visitor' } });
      await prisma.resource.update({
        where: { id: resource.id },
        data: { viewsCount: { increment: 1 } },
      });
    } catch (e) {
      // Ignore - tracking is best-effort
    }
  }

  // Similar resources (prisma throws intermittently on CF; fall back to empty)
  let similar: any[] = [];
  try {
    similar = await prisma.resource.findMany({
    where: { status: 'PUBLISHED', subjectId: resource.subjectId, NOT: { id: resource.id } },
    take: 4,
    orderBy: { viewsCount: 'desc' },
    select: {
      id: true,
      numericId: true,
      slug: true,
      title: true,
      viewsCount: true,
      downloadsCount: true,
      avgRating: true,
      commentsCount: true,
      subject: { select: { nameFr: true, color: true } },
      class: { select: { nameFr: true, slug: true } },
      teacher: {
        select: {
          numericId: true,
          slug: true,
          firstName: true,
          lastName: true,
          firstNameAr: true,
          lastNameAr: true,
          schoolName: true,
          schoolNameAr: true,
        },
      },
    },
  });
  } catch (e) {
    // Ignore - similar resources non-critical
  }

  // Star distribution
  const dist = [5, 4, 3, 2, 1].map((star) => ({
    star,
    count: resource.ratings.filter((r) => r.stars === star).length,
  }));
  const maxCount = Math.max(...dist.map((d) => d.count), 1);

  // JSON-LD structured data for SEO (LearningResource schema)
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://examanet.com';
  const resourceUrl = `${baseUrl}/ressources/${resource.numericId}/${resource.slug}`;
  const courseJsonLd = courseSchema({
    slug: resource.slug,
    title: resource.title,
    description:
      resource.description || `${resource.title} — Ressource pédagogique gratuite sur Examanet`,
    language: resource.language || 'fr',
    level: resource.class?.nameFr || resource.class?.level?.nameFr || 'Enseignement de base',
    cycle:
      (resource.headerData as any)?.cycle ||
      resource.class?.level?.nameFr ||
      'Enseignement de base',
    subject: resource.subject?.nameFr || 'Éducation',
    type: resource.type,
    year: resource.year,
    teacher: resource.teacher
      ? `${resource.teacher.firstName || ''} ${resource.teacher.lastName || ''}`
          .replace(/\s+/g, ' ')
          .trim() || null
      : null,
    teacherAr: resource.teacherNameAr || null,
    url: resourceUrl,
    datePublished: resource.publishedAt?.toISOString() || resource.createdAt?.toISOString(),
    dateModified: resource.updatedAt?.toISOString() || resource.createdAt?.toISOString(),
    aggregateRating,
    tags: resource.tags, // SEO: auto-generated tags boost discoverability
    generalSubject: resource.metadata?.generalSubject || null, // الموضوع العام → JSON-LD teaches + keywords
  });
  const breadcrumbJsonLd = breadcrumbSchema([
    { name: 'Accueil', url: baseUrl },
    { name: 'Ressources', url: `${baseUrl}/ressources` },
    ...(resource.subject
      ? [
          {
            name: resource.subject.nameFr || resource.subject.slug,
            url: `${baseUrl}/matieres/${resource.subject.slug}`,
          },
        ]
      : []),
    ...(resource.class
      ? [
          {
            name: resource.class.nameFr || resource.class.slug,
            url: `${baseUrl}/niveaux/${resource.class.level?.slug}?class=${resource.class.slug}`,
          },
        ]
      : []),
    { name: resource.title || 'Ressource', url: resourceUrl },
  ]);

  return (
    <div className="min-h-screen flex flex-col">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(courseJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />
      {/* 2026-08-19 nightly fix (ERR-FGCMHE 1× React #419 on /ar/ressources/3740/...):
          use a <div> instead of <main> because the [locale]/layout.tsx already
          wraps children in <main className="min-h-screen"> — nested <main>
          is an HTML5 accessibility violation and a known hydration-error
          trigger. The loading.tsx skeleton mirrors this change so the
          Suspense fallback and the streamed page have identical structure. */}
      <div className="flex-1 pt-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          {/* Visual breadcrumb (matches BreadcrumbList JSON-LD)
              2026-08-21 nightly fix (ERR-LHP3SU React #419 hydration on
              /fr/ressources/14703/... — 6 events captured, but the same
              child-count mismatch existed on every resource page):
              The previous code used React.Fragment for the conditional
              subject and class items, which made the nav have 5 React
              children (Link, svg, Link, Fragment, Fragment) while the
              loading.tsx skeleton had 7 (4 anchors + 3 chevrons). React's
              hydration check is child-count-strict, so this triggered
              React #418/#419 on every resource page. The visible error
              count was 6 because most users were sent to the canonical
              slug before hydration; the bug only surfaced when the slug
              redirected (i.e. the loading skeleton was hydrated against
              the page's RSC payload that included the breadcrumb).
              Fix: apply the "always render, hide via CSS" pattern. The
              nav now has exactly 5 React children in both the page and
              the loading skeleton: Link + ChevronRight + Link + subject-
              span + class-span. Each span wraps a ChevronRight + Link
              pair and is hidden via `hidden` class + `aria-hidden` when
              the condition is false. For resources without subject/class
              (rare but possible — schema allows classId: null), the
              spans are display:none and the inner Link hrefs/text are
              empty. The loading skeleton mirrors this exact structure
              with the spans always hidden. */}
          <nav
            aria-label="Fil d'Ariane"
            className="flex items-center gap-1 text-xs text-slate-500 mb-4 flex-wrap"
          >
            <Link href="/" className="hover:text-primary-600 transition">
              Accueil
            </Link>
            <ChevronRight className="w-3 h-3 text-slate-300" />
            <Link href="/ressources" className="hover:text-primary-600 transition">
              Ressources
            </Link>
            <span
              className={`inline-flex items-center gap-1 ${resource.subject ? '' : 'hidden'}`}
              aria-hidden={!resource.subject}
            >
              <ChevronRight className="w-3 h-3 text-slate-300" />
              <Link
                href={resource.subject ? `/matieres/${resource.subject.slug}` : '/matieres'}
                className="hover:text-primary-600 transition"
                tabIndex={resource.subject ? undefined : -1}
              >
                {resource.subject?.nameFr || ''}
              </Link>
            </span>
            <span
              className={`inline-flex items-center gap-1 ${resource.class ? '' : 'hidden'}`}
              aria-hidden={!resource.class}
            >
              <ChevronRight className="w-3 h-3 text-slate-300" />
              <Link
                href={resource.class ? `/niveaux/${resource.class.level?.slug}` : '/niveaux'}
                className="hover:text-primary-600 transition"
                tabIndex={resource.class ? undefined : -1}
              >
                {resource.class?.nameFr || ''}
              </Link>
            </span>
          </nav>

          {/* ============================================================
              SCRIBD-STYLE HEADER (NEW 2026-08-16)
              Renders above the existing 2-col grid. Gives the resource page
              the modern look from fr.scribd.com — big title, stats line,
              expandable description, action buttons grid, AI badge, etc.
             ============================================================ */}
          
<ResourceScribdHeader            resourceId={resource.id}
            title={(() => {
              const { fr } = splitArabicSubject(resource.title);
              return fr;
            })()}
            titleAr={(() => {
              const { ar } = splitArabicSubject(resource.title);
              return ar || null;
            })()}
            description={resource.description}
            pageCount={resource.pageCount ?? null}
            fileSize={resource.fileSize ? humanFileSize(resource.fileSize) : null}
            viewsCount={resource.viewsCount}
            downloadsCount={resource.downloadsCount}
            avgRating={resource.avgRating}
            commentsCount={resource.commentsCount}
            downloadUrl={`/api/resources/${resource.numericId}/download`}
            teacherName={
              resource.teacher
                ? `${resource.teacher.firstName || ''} ${resource.teacher.lastName || ''}`.trim() || null
                : null
            }
            teacherNameAr={
              resource.teacher
                ? `${resource.teacher.firstNameAr || ''} ${resource.teacher.lastNameAr || ''}`.trim() || null
                : null
            }
            teacherProfileUrl={
              resource.teacher
                ? `/professeurs/${resource.teacher.numericId}/${resource.teacher.slug}`
                : null
            }
            aiInsights={(() => {
              const meta = resource.metadata as any;
              const insights = (meta?.exerciseInsights as string[] | undefined)?.length
                ? (meta.exerciseInsights as string[])
                : (meta?.keyInsights as string[] | undefined);
              return insights && insights.length > 0 ? insights : null;
            })()}
            aiKeyPoints={resource.metadata?.keyPoints || null}
            aiShortKeyPoints={(resource.metadata as any)?.shortKeyPoints || null}
            subjectName={(() => {
              // 2026-08-18: pass the subject name (lowercase, e.g. "base de
              // données", "algorithmique et programmation") to the
              // ResourceScribdHeader so the exercise insights accordion can
              // show "{N} exercices {matière}" instead of "{N} exercices
              // autre".
              const s = resource.subject as any;
              if (!s) return null;
              // Prefer the display name from the DB; fall back to slug.
              const name = s.nameFr || s.slug || null;
              if (!name) return null;
              return String(name).toLowerCase();
            })()}
            subjectSlug={resource.subject?.slug || null}
            isArDoc={(() => {
              const isPilotePhysiqueCollege =
                resource.schoolType === 'PILOTE' &&
                resource.subject?.slug === 'physique' &&
                resource.class &&
                ['7eme', '8eme', '9eme'].includes(resource.class.slug);
              return resource.language === 'ar' && !isPilotePhysiqueCollege;
            })()}
          />

          <div className="grid grid-cols-1 gap-6">
            {/* MAIN — single column. Sidebar (teacher + info panel) was
                removed 2026-08-17 to give the PDF viewer more width.
                The teacher is now in the ScribdHeader ('Transféré par')
                and the info panel is below the PDF viewer. */}
            <div>
              {/* ARCHIVED banner — shown to non-owners when the resource is no longer public */}
              {isArchived && (
                <div className="bg-amber-50 border-2 border-amber-200 rounded-2xl p-5 mb-4">
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 w-10 h-10 rounded-full bg-amber-200 flex items-center justify-center text-amber-700 font-bold text-lg">
                      !
                    </div>
                    <div className="flex-1">
                      <h2 className="font-bold text-amber-900 mb-1">
                        Cette ressource n'est plus disponible
                      </h2>
                      <p className="text-sm text-amber-800">
                        Ce document a été archivé et n'est plus accessible au public.
                        {resource.subject && resource.class && (
                          <>
                            {' '}Vous pouvez explorer d'autres ressources de{' '}
                            <Link
                              href={`/matieres/${resource.subject.slug}/${resource.class.slug}`}
                              className="font-semibold underline hover:text-amber-900"
                            >
                              {resource.subject.nameFr} — {resource.class.nameFr}
                            </Link>
                            .
                          </>
                        )}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* PROMINENT correction banner — students search corrected homeworks */}
              {resource.hasCorrection && (
                <div className="bg-gradient-to-r from-emerald-500 via-emerald-600 to-teal-600 text-white rounded-2xl p-5 mb-4 shadow-lg border-2 border-emerald-400/50">
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
                      <CheckCircle2 className="w-6 h-6" />
                    </div>
                    <div className="flex-1">
                      <h2 className="font-extrabold text-lg mb-1">
                        ✅ Ce document contient un corrigé
                      </h2>
                      {resource.correctionSummary ? (
                        <p className="text-sm text-emerald-50">{resource.correctionSummary}</p>
                      ) : (
                        <p className="text-sm text-emerald-50">
                          Le corrigé détaillé est intégré à la fin du document. Faites défiler pour
                          le consulter.
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* 2026-08-19: removed the empty wrapper div that was rendering
                  as a white rectangle on every page with no AI data. The
                  original block contained 3 IIFEs that all returned null.
                  The product chip (technologie+college) is preserved below. */}

              {/* Product (المنتج) — only for technologie + college.
                  2026-08-21 nightly fix (ERR-LHP3SU React #419): apply the
                  "always render, hide via CSS" pattern. The previous code
                  used a conditional render — the wrapper existed only for
                  technologie+college resources, while loading.tsx always
                  rendered an empty placeholder. This caused a child-count
                  mismatch (page=0, loading=1) on every typical resource
                  page. The wrapper is now always rendered and hidden via
                  `hidden` class + `aria-hidden` when the conditions aren't
                  met. The inner content (Wrench + 2 spans) is also always
                  rendered, hidden when the wrapper is hidden. The loading
                  skeleton mirrors this exact structure. `suppressHydrationWarning`
                  on the product-name span prevents React #419 because the
                  loading skeleton can't know the product name during the
                  Suspense fallback. */}
              {(() => {
                const showProduct = !!(
                  resource.product &&
                  resource.subject?.slug === 'technologie' &&
                  resource.class &&
                  ['7eme', '8eme', '9eme'].includes(resource.class.slug)
                );
                return (
                  <div
                    className={`bg-white rounded-2xl border border-slate-100 p-6 lg:p-8 mb-4 ${showProduct ? '' : 'hidden'}`}
                    aria-hidden={!showProduct}
                  >
                    <div className={`mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg inline-flex items-center gap-2 text-sm ${showProduct ? '' : 'hidden'}`}>
                      <Wrench className="w-4 h-4 text-amber-700" />
                      <span className="font-bold text-amber-900">المنتج / Produit :</span>
                      <span className="text-amber-800" dir="rtl" suppressHydrationWarning>
                        {resource.product || ''}
                      </span>
                    </div>
                  </div>
                );
              })()}

              {/* Aperçu PDF — hidden for archived resources (non-owners).
                  2026-08-16: removed the "Aperçu du document" header and
                  "Ouvrir en plein écran →" link above the viewer to save
                  vertical space. The fullscreen button is still available
                  in the floating toolbar (bottom-center glass pill), and
                  the viewer itself is self-explanatory. */}
              {canViewBody && (
              <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden mb-4">
                <div className="p-0">
                  <LazyPDFViewer
                    url={`/api/resources/${resource.numericId}/download`}
                    fileName={`${resource.title}.pdf`}
                    pageCount={resource.pageCount ?? null}
                    fileSize={resource.fileSize ? humanFileSize(resource.fileSize) : null}
                  />
                </div>
              </div>
              )}

              {/* Action buttons (ResourceActions) — moved here 2026-08-17
                  from its old position (above the PDF viewer, in the title
                  card). User wanted the action button grid (Télécharger,
                  Lire en ligne, Imprimer, Favoris, Partager, Signaler) to
                  be right under the PDF viewer for quick access. */}
              {canViewBody && (
                <ResourceActions
                  resourceId={resource.id} numericId={resource.numericId}
                  slug={resource.slug}
                  title={resource.title}
                  fileUrl={`/api/resources/${resource.numericId}/download`}
                  originalFileKey={resource.originalFileKey}
                  originalFileName={resource.originalFileName}
                  originalFormat={resource.originalFormat}
                  isTeacher={userSession?.role === 'TEACHER' || userSession?.role === 'ADMIN'}
                  isOwner={userSession?.id === resource.teacherId}
                />
              )}

              {/* Info Panel — moved from the right sidebar 2026-08-17.
                  Shown below the PDF viewer so the PDF gets full width. */}
              <ResourceInfoPanel
                resource={resource}
                hideClasse={resource.class?.level?.slug === 'lycee'}
              />

              {/* Notation — hidden for archived resources (non-owners) */}
              {canViewBody && (
              
<RatingSection                resourceId={resource.id}
                avgRating={resource.avgRating}
                ratingCount={resource.ratingCount}
                distribution={dist}
                maxCount={maxCount}
              />
              )}

              {/* Commentaires — hidden for archived resources (non-owners) */}
              {canViewBody && (
              
<CommentsSection                resourceId={resource.id}
                initialComments={resource.comments.map((c) => ({
                  id: c.id,
                  content: c.content,
                  createdAt: c.createdAt.toISOString(),
                  // Pre-compute the relative-time label on the server so the
                  // client component can render byte-for-byte identical HTML
                  // (timeAgo uses Date.now() — non-deterministic across
                  // SSR/hydration). CommentsSection re-runs timeAgo in
                  // useEffect after mount to tick the label forward.
                  createdAtLabel: timeAgo(c.createdAt),
                  user: c.user,
                }))}
              />
              )}

              {/* Similaires */}
              {similar.length > 0 && (
                <div className="mt-6">
                  <h2 className="font-bold text-xl mb-4">📚 Ressources similaires</h2>
                  <div className="grid sm:grid-cols-2 gap-4">
                    {similar.map((s) => (
                      <Link
                        key={s.id}
                        href={`/ressources/${s.numericId}/${s.slug}`}
                        className="card card-hover p-4 flex gap-3"
                      >
                        <div className="w-16 h-20 bg-slate-100 rounded flex items-center justify-center flex-shrink-0">
                          <FileText className="w-8 h-8 text-slate-300" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="font-bold text-sm line-clamp-2 mb-1">{s.title}</h3>
                          <div className="flex items-center gap-2 text-xs text-slate-500">
                            <span className="flex items-center gap-1">
                              <Eye className="w-3 h-3" /> {formatNumber(s.viewsCount)}
                            </span>
                            <span className="flex items-center gap-1">
                              <Star className="w-3 h-3 fill-amber-400 text-amber-400" />{' '}
                              {s.avgRating.toFixed(1)}
                            </span>
                          </div>
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* ResourceInfoPanel — moved here from the right sidebar
                2026-08-17. The teacher card was removed (it's in the
                ScribdHeader "Transféré par" attribution). Hide the "Classe"
                row for lycée files (already in the title format). */}
          </div>
        </div>
      </div>
      </div>
  );
}


