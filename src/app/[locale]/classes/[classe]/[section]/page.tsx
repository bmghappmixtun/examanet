// @ts-nocheck
/**
 * /[locale]/classes/[classe]/[section] — SEO landing page for one
 * class × filière combination (19 pages).
 *
 * 2026-10-22 — these pages did not exist before. The mega menu only pointed at
 * /ressources?class=X&section=Y, and Google consolidates crawl parameters, so
 * queries like "devoir 3ème sciences" or "sujets bac 4ème sciences
 * expérimentales" had no landing page to rank.
 *
 * Safety rules honoured:
 *  - no getCloudflareContext in generateMetadata (Leçon #93)
 *  - toLocaleString always pinned (Leçon #101)
 *  - ONE <script type="application/ld+json"> per schema (Leçon #108)
 */

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getLocale } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { ChevronRight } from 'lucide-react';
import ClassesLanding, { type LandingResource } from '../../ClassesLanding';
import { getSectionPages, getClassBySlug } from '@/lib/classes-seo';
import { breadcrumbSchema } from '@/lib/structured-data';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://examanet.com';
const PAGE_SIZE = 24;

/** Under this, the page is thin content -> kept crawlable but noindexed. */
const MIN_RESOURCES = 15;

export function generateStaticParams() {
  const out: { locale: string; classe: string; section: string }[] = [];
  for (const locale of ['fr', 'ar']) {
    for (const s of getSectionPages()) {
      out.push({ locale, classe: s.classSlug, section: s.sectionSlug });
    }
  }
  return out;
}

function findPage(classe: string, section: string) {
  return getSectionPages().find((s) => s.classSlug === classe && s.sectionSlug === section);
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ classe: string; section: string }>;
}): Promise<Metadata> {
  const { classe, section } = await params;
  const locale = await getLocale();
  const isAr = locale === 'ar';
  const page = findPage(classe, section);
  if (!page) return {};
  return {
    title: isAr ? page.title.ar : page.title.fr,
    description: isAr ? page.description.ar : page.description.fr,
    alternates: {
      canonical: `${SITE_URL}/${locale}/classes/${classe}/${section}`,
      languages: {
        fr: `${SITE_URL}/fr/classes/${classe}/${section}`,
        ar: `${SITE_URL}/ar/classes/${classe}/${section}`,
      },
    },
    openGraph: {
      title: isAr ? page.title.ar : page.title.fr,
      description: isAr ? page.description.ar : page.description.fr,
      url: `${SITE_URL}/${locale}/classes/${classe}/${section}`,
      siteName: isAr ? 'إكسامانت' : 'Examanet',
      locale: isAr ? 'ar_TN' : 'fr_TN',
      type: 'website',
    },
  };
}

/** Same shape / same joins as /api/ressources-data so filters match exactly. */
async function getResources(classe: string, section: string) {
  let db: any = null;
  try {
    const { getCloudflareContext } = await import('@opennextjs/cloudflare');
    const ctx = await getCloudflareContext({ async: true });
    db = (ctx as any)?.env?.DB;
  } catch {
    db = null;
  }
  if (!db) return { items: [] as LandingResource[], total: 0 };

  const baseWhere =
    "r.status = 'PUBLISHED' AND r.isHidden = 0 AND cls.slug = ? AND sec.slug = ?";

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
         LEFT JOIN \`Section\` sec ON r.sectionId = sec.id
         WHERE ${baseWhere}
         ORDER BY r.publishedAt DESC
         LIMIT ?`,
      )
      .bind(classe, section, PAGE_SIZE)
      .all();

    const cnt: any = await db
      .prepare(
        `SELECT COUNT(*) as total FROM Resource r
         LEFT JOIN \`Class\` cls ON r.classId = cls.id
         LEFT JOIN \`Section\` sec ON r.sectionId = sec.id
         WHERE ${baseWhere}`,
      )
      .bind(classe, section)
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
    console.error('[classes/section] D1 error', e?.message);
    return { items: [] as LandingResource[], total: 0 };
  }
}

export default async function SectionPage({
  params,
}: {
  params: Promise<{ classe: string; section: string }>;
}) {
  const { classe, section } = await params;
  const locale = await getLocale();
  const isAr = locale === 'ar';

  const page = findPage(classe, section);
  const cls = getClassBySlug(classe);
  if (!page || !cls) notFound();

  const { items, total } = await getResources(classe, section);

  const title = isAr ? page.title.ar : page.title.fr;
  const intro = isAr ? page.intro.ar : page.intro.fr;
  const h1 = isAr
    ? `${page.sectionLabel.ar} — ${page.classLabel.ar}`
    : `${page.classLabel.fr} — ${page.sectionLabel.fr}`;
  const browseHref = `/ressources?class=${classe}&section=${section}`;
  const faq = page.faq.map((f) => ({ q: isAr ? f.q.ar : f.q.fr, a: isAr ? f.a.ar : f.a.fr }));

  const breadcrumbLd = breadcrumbSchema([
    { name: isAr ? 'الرئيسية' : 'Accueil', url: `${SITE_URL}/${locale}` },
    { name: isAr ? 'المستويات' : 'Niveaux', url: `${SITE_URL}/${locale}/classes` },
    {
      name: isAr ? page.classLabel.ar : page.classLabel.fr,
      url: `${SITE_URL}/${locale}/classes/${classe}`,
    },
    {
      name: isAr ? page.sectionLabel.ar : page.sectionLabel.fr,
      url: `${SITE_URL}/${locale}/classes/${classe}/${section}`,
    },
  ]);

  // ONE script per schema (Leçon #108 — an array at the root crashes Safari).
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

  const faqLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faq.map((f) => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a },
    })),
  };

  // 2026-10-22: thin-content guard. 9 of the 19 filière pages currently have
  // 0–7 published resources (the whole 3ème secondaire set is empty). Those
  // pages must NOT enter the index — thin content actively hurts ranking — but
  // they still render so the mega menu never hits a 404. Same threshold as the
  // sitemap, so the two can never disagree.
  const isThin = total < MIN_RESOURCES;

  return (
    <>
      {isThin ? (
        <meta name="robots" content="noindex,follow" />
      ) : null}

      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListLd) }} />
      {!isThin ? (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd) }} />
      ) : null}

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 lg:py-12">
        {/* Breadcrumb */}
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
            <li>
              <Link href={`/classes/${classe}`} className="hover:text-primary-700">
                {isAr ? page.classLabel.ar : page.classLabel.fr}
              </Link>
            </li>
            <li aria-hidden="true">
              <ChevronRight className="w-3.5 h-3.5 rtl:rotate-180" />
            </li>
            <li aria-current="page" className="text-slate-700 font-semibold">
              {isAr ? page.sectionLabel.ar : page.sectionLabel.fr}
            </li>
          </ol>
        </nav>

        {/* Hero */}
        <header className="mb-8">
          <p className="text-xs font-semibold uppercase tracking-wide text-primary-700 mb-2">
            {isAr ? page.cycleLabel.ar : page.cycleLabel.fr}
          </p>
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-slate-900 leading-tight mb-3">
            {h1}
          </h1>
          <p className="text-base sm:text-lg text-slate-600 max-w-3xl leading-relaxed">
            {intro}
          </p>
        </header>

        {/* Sister filières */}
        {cls.sections.length > 1 ? (
          <nav className="mb-8" aria-label={isAr ? 'المسالك' : 'Autres filières'}>
            <h2 className="text-sm font-semibold text-slate-500 mb-2">
              {isAr ? 'مسالك أخرى في هذه السنة' : 'Autres filières de cette année'}
            </h2>
            <ul className="flex flex-wrap gap-2">
              {cls.sections
                .filter((s) => s.slug !== section)
                .map((s) => (
                  <li key={s.slug}>
                    <Link
                      href={`/classes/${classe}/${s.slug}`}
                      className="inline-block px-3 py-1.5 rounded-full text-xs font-semibold bg-white border border-slate-200 text-slate-700 hover:border-primary-400 hover:text-primary-700 transition"
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
          faq={faq}
          browseAllHref={browseHref}
          browseAllLabel={
            isAr ? `تصفح كل موارد ${page.sectionLabel.ar}` : `Voir toutes les ressources ${page.sectionLabel.fr}`
          }
        />
      </div>
    </>
  );
}