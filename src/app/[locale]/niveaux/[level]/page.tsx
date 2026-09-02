// @ts-nocheck
import { getLocale } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import ResourceCard from '@/components/resources/ResourceCard';
import { prisma } from '@/lib/prisma';
import { getUserFavorites, decorateWithFavorites } from '@/lib/resource-helpers';
import { ChevronRight } from 'lucide-react';
import { breadcrumbSchema } from '@/lib/structured-data';
import { getLocalizedName } from '@/lib/localized-name';

export const revalidate = 300; // 5 min cache

export async function generateMetadata({ params }: { params: Promise<{ level: string }> }) {
  const { level: levelSlug } = await params;
  const locale = await getLocale();
  const level = await prisma.level.findUnique({
    where: { slug: levelSlug },
    select: { nameFr: true, nameAr: true, slug: true },
  });
  if (!level) return { title: 'Niveau non trouvé' };
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://examanet.com';
  return {
    title: `${getLocalizedName(level, locale)} — Cours et Devoirs gratuits`,
    description: `Ressources pédagogiques gratuites pour ${getLocalizedName(level, locale)} en Tunisie : cours, devoirs, exercices et corrigés.`,
    alternates: { canonical: `${baseUrl}/niveaux/${level.slug}` },
    openGraph: {
      title: `${getLocalizedName(level, locale)} — Examanet`,
      description: `Cours et devoirs gratuits pour ${getLocalizedName(level, locale)}.`,
      url: `${baseUrl}/niveaux/${level.slug}`,
      locale: 'fr_TN',
      type: 'website',
    },
  };
}

export default async function LevelPage({ params }: { params: Promise<{ level: string }> }) {
  const { level: levelSlug } = await params;
  const locale = await getLocale();
  const level = await prisma.level.findUnique({ where: { slug: levelSlug } });
  if (!level)
    return (
      <div className="min-h-screen flex items-center justify-center">
        <h1 className="text-2xl font-bold">Niveau non trouvé</h1>
      </div>
    );

  const classes = await prisma.class.findMany({
    where: { levelId: level.id },
    orderBy: { order: 'asc' },
    include: {
      _count: { select: { resources: { where: { status: 'PUBLISHED' } } } },
    },
  });

  const recentResources = await prisma.resource.findMany({
    where: { class: { level: { slug: levelSlug } }, status: 'PUBLISHED' },
    take: 8,
    orderBy: { publishedAt: 'desc' },
    include: {
      subject: true,
      class: true,
      teacher: { select: { firstName: true, lastName: true, firstNameAr: true, lastNameAr: true } },
    },
  });

  // Decorate with isFavorited
  const levelFavIds = await getUserFavorites(recentResources.map((r) => r.id));
  const decoratedLevelResources = decorateWithFavorites(recentResources, levelFavIds);

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
