// @ts-nocheck
import { getLocale } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import ResourceCard from '@/components/resources/ResourceCard';
// Replaced prisma-compat with D1 direct (2026-09-02)
async function getD1() {
  const { getCloudflareContext } = await import('@opennextjs/cloudflare');
  const ctx = await getCloudflareContext({ async: true });
  return (ctx as any).env?.DB;
}
import { getUserFavorites, decorateWithFavorites } from '@/lib/resource-helpers';
import { ChevronRight } from 'lucide-react';
import { breadcrumbSchema } from '@/lib/structured-data';
import { getLocalizedName } from '@/lib/localized-name';

export const revalidate = 300; // 5 min cache

export async function generateMetadata({ params }: { params: Promise<{ level: string }> }) {
  const { level: levelSlug } = await params;
  const locale = await getLocale();
  const db = await getD1();
  const level: any = await db?.prepare("SELECT nameFr, nameAr, slug FROM Level WHERE slug = ?").bind(levelSlug).first();
  if (!level) {
    return {
      title: 'Niveau non trouvé',
      // 2026-09-12: Still emit canonical even for non-existent levels so
      // Google doesn't flag these as having no canonical link tag.
      alternates: {
        canonical: `${baseUrl}${locale === 'ar' ? '/ar' : '/fr'}/niveaux/${levelSlug}`,
      },
      robots: { index: false, follow: true },
    };
  }
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://examanet.com';
  return {
    title: `${getLocalizedName(level, locale)} — Cours et Devoirs gratuits`,
    description: `Ressources pédagogiques gratuites pour ${getLocalizedName(level, locale)} en Tunisie : cours, devoirs, exercices et corrigés.`,
    alternates: {
      canonical: `${baseUrl}${locale === 'ar' ? '/ar' : '/fr'}/niveaux/${level.slug}`,
    },
    openGraph: {
      title: `${getLocalizedName(level, locale)} — Examanet`,
      description: `Cours et devoirs gratuits pour ${getLocalizedName(level, locale)}.`,
      url: `${baseUrl}${locale === 'ar' ? '/ar' : '/fr'}/niveaux/${level.slug}`,
      locale: locale === 'ar' ? 'ar_TN' : 'fr_TN',
      type: 'website',
    },
  };
}

export default async function LevelPage({ params }: { params: Promise<{ level: string }> }) {
  const { level: levelSlug } = await params;
  const locale = await getLocale();
  const db = await getD1();
  if (!db) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <h1 className="text-2xl font-bold">Niveau non trouvé</h1>
      </div>
    );
  }
  const level: any = await db.prepare("SELECT * FROM Level WHERE slug = ?").bind(levelSlug).first();
  if (!level)
    return (
      <div className="min-h-screen flex items-center justify-center">
        <h1 className="text-2xl font-bold">Niveau non trouvé</h1>
      </div>
    );

  // Get classes for this level with resource counts
  // (no ORDER BY in SQL — sort in JS to avoid "order" reserved word in D1 SQL)
  const classesRes: any = await db.prepare(
    "SELECT c.id, c.slug, c.nameFr, c.nameAr, c.numericId, c.[order] as ord, (SELECT COUNT(*) FROM Resource r WHERE r.classId = c.id AND r.status = 'PUBLISHED') as resourceCount FROM Class c WHERE c.levelId = ?"
  ).bind(level.id).all();
  const classes = ((classesRes?.results || []) as any[])
    .map((c: any) => ({ ...c, _count: { resources: c.resourceCount || 0 } }))
    .sort((a: any, b: any) => (a.ord || 0) - (b.ord || 0));


  // Get recent resources for this level (via Class join)
  const recentRes: any = await db.prepare([
    "SELECT r.id, r.numericId, r.slug, r.title, r.type, r.year, r.hasCorrection,",
    "r.viewsCount, r.downloadsCount, r.avgRating, r.ratingsCount, r.publishedAt,",
    "r.thumbnailUrl, r.thumbnailKey, r.subjectId, r.classId, r.teacherId,",
    "s.id as s_id, s.slug as s_slug, s.nameFr as s_nameFr, s.nameAr as s_nameAr, s.color as s_color,",
    "cl.id as cl_id, cl.slug as cl_slug, cl.nameFr as cl_nameFr,",
    "t.id as t_id, t.firstName as t_firstName, t.lastName as t_lastName, t.firstNameAr as t_firstNameAr, t.lastNameAr as t_lastNameAr, t.avatarUrl as t_avatarUrl",
    "FROM Resource r",
    "INNER JOIN Class c ON r.classId = c.id",
    "LEFT JOIN `Subject` s ON r.subjectId = s.id",
    "LEFT JOIN Class cl ON r.classId = cl.id",
    "LEFT JOIN `User` t ON r.teacherId = t.id",
    "WHERE c.levelId = ? AND r.status = 'PUBLISHED'",
    "ORDER BY r.publishedAt DESC LIMIT 8",
  ].join(' ')).bind(level.id).all();
  
  const recentResources = (recentRes?.results || []).map((r: any) => ({
    id: r.id,
    numericId: r.numericId,
    slug: r.slug,
    title: r.title,
    type: r.type,
    year: r.year,
    hasCorrection: !!r.hasCorrection,
    viewsCount: r.viewsCount || 0,
    downloadsCount: r.downloadsCount || 0,
    avgRating: r.avgRating || 0,
    ratingCount: r.ratingsCount || 0,
    commentsCount: r.commentsCount || 0,
    favoritesCount: r.favoritesCount || 0,
    publishedAt: r.publishedAt,
    thumbnailUrl: r.thumbnailUrl,
    thumbnailKey: r.thumbnailKey,
    subjectId: r.subjectId,
    classId: r.classId,
    teacherId: r.teacherId,
    subject: r.s_id ? { id: r.s_id, slug: r.s_slug, nameFr: r.s_nameFr, nameAr: r.s_nameAr, color: r.s_color } : null,
    class: r.cl_id ? { id: r.cl_id, slug: r.cl_slug, nameFr: r.cl_nameFr } : null,
    teacher: r.t_id ? { id: r.t_id, firstName: r.t_firstName, lastName: r.t_lastName, firstNameAr: r.t_firstNameAr, lastNameAr: r.t_lastNameAr, avatarUrl: r.t_avatarUrl } : null,
  }));

  // D1 direct: no user session check, all resources get isFavorited=false
  const decoratedLevelResources = recentResources;

  return (
    <div className="min-h-screen flex flex-col">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(
            breadcrumbSchema([
              {
                name: 'Accueil',
                url: `${process.env.NEXT_PUBLIC_SITE_URL || 'https://examanet.com'}/`,
              },
              {
                name: 'Niveaux',
                url: `${process.env.NEXT_PUBLIC_SITE_URL || 'https://examanet.com'}/niveaux`,
              },
              {
                name: level.nameFr || level.slug,
                url: `${process.env.NEXT_PUBLIC_SITE_URL || 'https://examanet.com'}/niveaux/${level.slug}`,
              },
            ]),
          ),
        }}
      />
      <main className="flex-1 pt-20">
        <div className="bg-gradient-to-br from-primary-50 to-sky-50 py-12">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <nav className="flex items-center gap-2 text-sm text-slate-500 mb-4">
              <Link href="/" className="hover:text-primary-600">
                Accueil
              </Link>
              <ChevronRight className="w-4 h-4" />
              <span className="text-slate-900 font-semibold">{getLocalizedName(level, locale)}</span>
            </nav>
            <h1 className="text-4xl lg:text-5xl font-extrabold mb-3">{getLocalizedName(level, locale)}</h1>
            <p className="text-lg text-slate-600">
              {classes.length} classes · {classes.reduce((s, c) => s + c._count.resources, 0)}{' '}
              ressources
            </p>
          </div>
        </div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
          <div className="grid lg:grid-cols-[280px_1fr] gap-8">
            <aside>
              <div className="bg-white rounded-2xl border border-slate-100 p-5 sticky top-24">
                <h3 className="font-bold mb-3">Classes</h3>
                <div className="space-y-1">
                  {classes.map((c) => (
                    <Link
                      key={c.id}
                      href={`/niveaux/${levelSlug}?class=${c.slug}`}
                      className="flex items-center justify-between px-3 py-2.5 rounded-lg hover:bg-primary-50 text-sm font-medium transition"
                    >
                      <span>{getLocalizedName(c, locale)}</span>
                      <span className="text-xs bg-slate-100 px-2 py-0.5 rounded-full">
                        {c._count.resources}
                      </span>
                    </Link>
                  ))}
                </div>
              </div>
            </aside>

            <div>
              {recentResources.length > 0 && (
                <div className="mb-8">
                  <h2 className="text-2xl font-bold mb-4">Dernières ressources</h2>
                  <div className="grid sm:grid-cols-2 gap-4">
                    {decoratedLevelResources.map((r) => (
                      <ResourceCard key={r.id} resource={r as any} />
                    ))}
                  </div>
                </div>
              )}
              {recentResources.length === 0 && (
                <div className="bg-white rounded-2xl p-12 text-center border border-slate-100">
                  <div className="text-5xl mb-3">📚</div>
                  <h3 className="font-bold text-xl mb-2">Aucune ressource pour le moment</h3>
                  <p className="text-slate-500">Revenez bientôt !</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
      </div>
  );
}
