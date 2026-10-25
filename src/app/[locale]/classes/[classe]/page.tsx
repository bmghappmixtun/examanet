// @ts-nocheck
/**
 * /[locale]/classes/[classe] — SEO landing page per class (7 pages).
 *
 * Shows the resource count for the whole class, links to every filière and
 * renders the most recent resources. Complements the existing
 * /niveaux/[level] pages (which are driven by the `Level` table = collège /
 * lycée / bac) — this one is driven by the `Class` table = 7eme … 4eme-secondaire.
 */

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getLocale } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { ChevronRight } from 'lucide-react';
import ClassesLanding, { type LandingResource } from '../ClassesLanding';
import { getClassPages, getClassBySlug } from '@/lib/classes-seo';
import { breadcrumbSchema } from '@/lib/structured-data';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://examanet.com';
const PAGE_SIZE = 24;

export function generateStaticParams() {
  const out: { locale: string; classe: string }[] = [];
  for (const locale of ['fr', 'ar']) {
    for (const c of getClassPages()) out.push({ locale, classe: c.slug });
  }
  return out;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ classe: string }>;
}): Promise<Metadata> {
  const { classe } = await params;
  const locale = await getLocale();
  const isAr = locale === 'ar';
  const page = getClassPages().find((c) => c.slug === classe);
  if (!page) return {};
  return {
    title: isAr ? page.title.ar : page.title.fr,
    description: isAr ? page.description.ar : page.description.fr,
    alternates: {
      canonical: `${SITE_URL}/${locale}/classes/${classe}`,
      languages: {
        fr: `${SITE_URL}/fr/classes/${classe}`,
        ar: `${SITE_URL}/ar/classes/${classe}`,
      },
    },
    openGraph: {
      title: isAr ? page.title.ar : page.title.fr,
      description: isAr ? page.description.ar : page.description.fr,
      url: `${SITE_URL}/${locale}/classes/${classe}`,
      siteName: isAr ? 'إكسامانت' : 'Examanet',
      locale: isAr ? 'ar_TN' : 'fr_TN',
      type: 'website',
    },
  };
}

async function getResources(classe: string) {
  let db: any = null;
  try {
    const { getCloudflareContext } = await import('@opennextjs/cloudflare');
    const ctx = await getCloudflareContext({ async: true });
    db = (ctx as any)?.env?.DB;
  } catch {
    db = null;
  }
  if (!db) return { items: [] as LandingResource[], total: 0 };

  const baseWhere = "r.status = 'PUBLISHED' AND r.isHidden = 0 AND cls.slug = ?";

  try {
    const rows: any = await db
      .prepare(
        `SELECT
           r.id, r.slug, r.numericId, r.title, r.summary, r.type, r.year,
           r.hasCorrection, r.viewsCount, r.downloadsCount, r.avgRating,
           r.ratingsCount, r.commentsCount, r.pageCount, r.fileSize,
           r.language, r.publishedAt,
           s.slug as s_slug, s.nameFr as s_nameFr, s.color as s_color, s.icon as s_icon,
           t.firstName as t_firstName, t.lastName as t_lastName
         FROM Resource r
         LEFT JOIN \`Subject\` s ON r.subjectId = s.id
         LEFT JOIN \`User\` t ON r.teacherId = t.id
         LEFT JOIN \`Class\` cls ON r.classId = cls.id
         WHERE ${baseWhere}
         ORDER BY r.publishedAt DESC
         LIMIT ?`,
      )
      .bind(classe, PAGE_SIZE)
      .all();

    const cnt: any = await db
      .prepare(
        `SELECT COUNT(*) as total FROM Resource r
         LEFT JOIN \`Class\` cls ON r.classId = cls.id
         WHERE ${baseWhere}`,
      )
      .bind(classe)
      .first();

    const items = (rows?.results || []).map((r: any) => ({
      id: r.id,
      numericId: r.numericId,
      slug: r.slug,
      title: r.title,
      summary: r.summary ?? null,
      type: r.type,
      year: r.year != null ? String(r.year) : null,
      hasCorrection: !!r.hasCorrection,
      viewsCount: r.viewsCount || 0,
      downloadsCount: r.downloadsCount || 0,
      avgRating: r.avgRating || 0,
      ratingCount: r.ratingsCount || 0,
      commentsCount: r.commentsCount || 0,
      pageCount: r.pageCount ?? null,
      fileSize: r.fileSize ?? null,
      language: r.language ?? undefined,
      publishedAt: r.publishedAt ?? null,
      subject: r.s_slug
        ? { slug: r.s_slug, nameFr: r.s_nameFr, color: r.s_color, icon: r.s_icon }
        : { slug: 'general', nameFr: 'Général', color: null, icon: null },
      class: { slug: classe, nameFr: classe },
      teacher: r.t_firstName || r.t_lastName
        ? { firstName: r.t_firstName, lastName: r.t_lastName }
        : null,
    }));

    return { items, total: cnt?.total || 0 };
  } catch (e: any) {
    console.error('[classes/classe] D1 error', e?.message);
    return { items: [] as LandingResource[], total: 0 };
  }
}

export default async function ClassPage({
  params,
}: {
  params: Promise<{ classe: string }>;
}) {
  const { classe } = await params;
  const locale = await getLocale();
  const isAr = locale === 'ar';

  const page = getClassPages().find((c) => c.slug === classe);
  const cls = getClassBySlug(classe);
  if (!page || !cls) notFound();

  const { items, total } = await getResources(classe);

  const h1 = isAr ? page.label.ar : page.label.fr;
  const title = isAr ? page.title.ar : page.title.fr;
  const intro = isAr ? page.intro.ar : page.intro.fr;
  const numberFormat = new Intl.NumberFormat(isAr ? 'ar-TN' : 'fr-FR');

  const breadcrumbLd = breadcrumbSchema([
    { name: isAr ? 'الرئيسية' : 'Accueil', url: `${SITE_URL}/${locale}` },
    { name: isAr ? 'المستويات' : 'Niveaux', url: `${SITE_URL}/${locale}/classes` },
    { name: h1, url: `${SITE_URL}/${locale}/classes/${classe}` },
  ]);

  const itemListLd = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: title,
    numberOfItems: total,
    itemListElement: items.slice(0, 20).map((r, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      url: `${SITE_URL}/${locale}/ressources/${r.numericId}/${r.slug}`,
      name: r.title,
    })),
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListLd) }} />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 lg:py-12">
        <nav aria-label="Breadcrumb" className="mb-6 text-sm text-slate-500">
          <ol className="flex flex-wrap items-center gap-1">
            <li>
              <Link href="/" className="hover:text-primary-700">
                {isAr ? 'الرئيسية' : 'Accueil'}
              </Link>
            </li>
            <li aria-hidden="true">
              <ChevronRight className="w-3.5 h-3.5 rtl:rotate-180" />
            </li>
            <li>
              <Link href="/classes" className="hover:text-primary-700">
                {isAr ? 'المستويات' : 'Niveaux'}
              </Link>
            </li>
            <li aria-hidden="true">
              <ChevronRight className="w-3.5 h-3.5 rtl:rotate-180" />
            </li>
            <li aria-current="page" className="text-slate-700 font-semibold">
              {h1}
            </li>
          </ol>
        </nav>

        <header className="mb-8">
          <p className="text-xs font-semibold uppercase tracking-wide text-primary-700 mb-2">
            {isAr ? page.cycleLabel.ar : page.cycleLabel.fr}
          </p>
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-slate-900 leading-tight mb-3">
            {h1}
          </h1>
          <p className="text-base sm:text-lg text-slate-600 max-w-3xl leading-relaxed">{intro}</p>
          {total > 0 ? (
            <p className="mt-3 text-sm font-semibold text-primary-800">
              {numberFormat.format(total)} {isAr ? 'مورد متاح' : 'ressources disponibles'}
            </p>
          ) : null}
        </header>

        {cls.sections.length > 0 ? (
          <nav className="mb-8" aria-label={isAr ? 'المسالك' : 'Filières'}>
            <h2 className="text-sm font-semibold text-slate-500 mb-2">
              {isAr ? 'اختر المسلك' : 'Choisissez la filière'}
            </h2>
            <ul className="flex flex-wrap gap-2">
              {cls.sections.map((s) => (
                <li key={s.slug}>
                  <Link
                    href={`/classes/${classe}/${s.slug}`}
                    className="inline-block px-4 py-2 rounded-full text-sm font-semibold bg-white border border-slate-200 text-slate-700 hover:border-primary-400 hover:text-primary-700 transition"
                  >
                    {isAr ? s.label.ar : s.label.fr}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ) : null}

        <ClassesLanding
          resources={items}
          total={total}
          isAr={isAr}
          faq={[]}
          browseAllHref={`/ressources?class=${classe}`}
          browseAllLabel={isAr ? 'تصفح كل الموارد' : 'Voir toutes les ressources'}
        />
      </div>
    </>
  );
}