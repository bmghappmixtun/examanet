'use client';
// @ts-nocheck
import { useEffect, useState } from 'react';
import { Link } from '@/i18n/navigation';
import { teacherNameFr, teacherNameAr } from '@/lib/utils';


// import { db } from '@/lib/d1-admin'; (removed for client)
// import { getCurrentUser } from '@/lib/auth'; (removed for client)
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



export default function ResourceDetailClient({ numericId, slug: initialSlug }: { numericId: number; slug: string }) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [notFoundState, setNotFoundState] = useState(false);
  // 2026-09-18 (v3): "Voir plein écran" needs to (1) force-activate the
  // LazyPDFViewer if it isn't already mounted, then (2) ask the PDFViewer
  // to request browser fullscreen once the PDF is loaded. The
  // fullscreenRequestId counter is bumped on every click so the
  // PDFViewer's effect re-fires even after the user exits fullscreen
  // with Échap (otherwise React skips the re-render).
  const [forceViewerActivation, setForceViewerActivation] = useState(false);
  const [autoFullscreen, setAutoFullscreen] = useState(false);
  const [fullscreenRequestId, setFullscreenRequestId] = useState(0);
  const handleFullscreenRequest = () => {
    setForceViewerActivation(true);
    setAutoFullscreen(true);
    setFullscreenRequestId((id) => id + 1);
  };
  
  useEffect(() => {
    let cancelled = false;
    async function fetchData() {
      try {
        const res = await fetch(`/api/ressources/${numericId}/detail`, { cache: 'no-store' });
        if (!res.ok) {
          if (res.status === 404) setNotFoundState(true);
          setLoading(false);
          return;
        }
        const json = await res.json();
        if (!cancelled) {
          setData(json);
          setLoading(false);
        }
      } catch (e) {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }
    fetchData();
    return () => { cancelled = true; };
  }, [numericId]);

  if (notFoundState) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
        <div className="max-w-md w-full bg-white rounded-2xl border border-slate-200 p-8 text-center">
          <h1 className="text-2xl font-bold text-slate-900 mb-2">Ressource non trouvée</h1>
          <p className="text-slate-600 text-sm mb-4">La ressource demandée n'existe pas ou a été supprimée.</p>
          <Link href="/ressources" className="text-primary-600 hover:underline">← Retour aux ressources</Link>
        </div>
      </div>
    );
  }

  if (loading || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-primary-600 border-r-transparent"></div>
          <p className="mt-4 text-slate-600">Chargement de la ressource...</p>
        </div>
      </div>
    );
  }

  // API data shape: { resource, ratings, comments }
  // No aggregateRating/similar/userSession in the response — compute safe defaults
  const resource = data.resource;
  const commentsFromApi = (data && data.comments) || [];
  const ratingsFromApi = (data && data.ratings) || [];
  // Compute aggregate rating from ratings
  const aggregateRating: any = ratingsFromApi.length > 0
    ? {
        ratingCount: ratingsFromApi.length,
        ratingValue: Math.round((ratingsFromApi.reduce((s: number, r: any) => s + r.stars, 0) / ratingsFromApi.length) * 10) / 10,
      }
    : null;
  const similar: any[] = (data && data.similar) || [];
  const userSession: any = (data && data.userSession) || null;

  // Visibility check (from original page)
  const isArchived = resource.status === 'ARCHIVED';
  const canViewBody = !isArchived || (userSession && (userSession.id === resource.teacherId || userSession.role === 'ADMIN'));

  // Star distribution (compute from ratings)
  const dist = [5, 4, 3, 2, 1].map((star) => ({
    star,
    count: ratingsFromApi.filter((r: any) => r.stars === star).length,
  }));
  const maxCount = Math.max(...dist.map((d: any) => d.count), 1);

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
    teacher: resource.teacher ? teacherNameFr(resource.teacher) || null : null,
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

  // 2026-09-15 nightly: wrap JSON.stringify in a try/catch with a minimal valid
  // fallback. Safari parses ld+json scripts eagerly and crashes with
  // `undefined is not an object (evaluating 'r["@context"].toLowerCase')`
  // when the script body is empty, malformed, or contains a circular ref.
  const safeJsonLd = (obj: unknown): string => {
    try {
      const json = JSON.stringify(obj);
      // Safari requires @context on the root object. If the schema is missing
      // it OR the string is empty, fall back to a minimal valid placeholder.
      if (!json || json === '{}' || !json.includes('"@context"')) {
        return '{"@context":"https://schema.org"}';
      }
      return json;
    } catch {
      return '{"@context":"https://schema.org"}';
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd(courseJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd(breadcrumbJsonLd) }}
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
            teacherName={resource.teacher ? teacherNameFr(resource.teacher) || null : null}
            teacherNameAr={resource.teacher ? teacherNameAr(resource.teacher) || null : null}
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
                    // 2026-08-27: use direct fileUrl from D1 (bypasses broken /download proxy on CF)
                    // The download button still uses the proxy for tracking
                    url={resource.fileUrl || `/api/resources/${resource.numericId}/download`}
                    fileName={`${resource.title}.pdf`}
                    pageCount={resource.pageCount ?? null}
                    fileSize={resource.fileSize ? humanFileSize(resource.fileSize) : null}
                    // 2026-09-18 (v3): parent-forced activation. The
                    // internal placeholder button still works because
                    // LazyPDFViewer ORs `forceActivated` with its own
                    // internal state (was buggy in v2 with `??`).
                    forceActivated={forceViewerActivation}
                    autoFullscreen={autoFullscreen}
                    fullscreenRequestId={fullscreenRequestId}
                  />
                </div>
              </div>
              )}

              {/* Action buttons (ResourceActions) — moved here 2026-08-17
                  from its old position (above the PDF viewer, in the title
                  card). User wanted the action button grid (Télécharger,
                  Voir plein écran, Imprimer, Favoris, Partager, Signaler)
                  to be right under the PDF viewer for quick access. */}
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
                  // 2026-09-18 (v2): same-page fullscreen instead of
                  // redirecting to /viewer.
                  onFullscreenRequest={handleFullscreenRequest}
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
                initialComments={commentsFromApi.map((c: any) => ({
                  id: c.id,
                  content: c.content,
                  createdAt: c.createdAt ? new Date(c.createdAt).toISOString() : new Date().toISOString(),
                  // Pre-compute the relative-time label on the server so the
                  // client component can render byte-for-byte identical HTML
                  // (timeAgo uses Date.now() — non-deterministic across
                  // SSR/hydration). CommentsSection re-runs timeAgo in
                  // useEffect after mount to tick the label forward.
                  createdAtLabel: timeAgo(c.createdAt ? new Date(c.createdAt) : new Date()),
                  user: c.user || { firstName: "", lastName: "", avatarUrl: null },
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


