// @ts-nocheck
/**
 * /[locale]/devoirs/[slug] — SEO-optimized landing page for "Devoirs [matière]"
 *
 * Renders SSR with first 24 devoir cards. Client component handles infinite
 * scroll + class tab switching.
 *
 * SEO goals:
 *   - URL contains "devoirs" keyword
 *   - H1 contains subject name + "Devoirs"
 *   - Server-rendered initial cards (Google indexes content immediately)
 *   - JSON-LD ItemList for the resources
 *   - OpenGraph + Twitter cards
 */
import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { Link } from '@/i18n/navigation';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { ChevronRight } from 'lucide-react';
import DevoirsListing from '@/components/devoirs/DevoirsListing';

export const revalidate = 300; // 5 min cache

interface Props {
  params: Promise<{ slug: string; locale: string }>;
  searchParams: Promise<{ class?: string }>;
}

// Helper: convert slug to display name without DB hit
function slugToDisplayName(slug: string): string {
  // Override for known subjects (matches SUBJECT_DISPLAY_NAME_OVERRIDES in mega menu)
  const OVERRIDES: Record<string, string> = {
    'svt': 'SVT',
    'systeme-exploitation-reseaux': 'STI',
    'mathematiques': 'Mathématiques',
  };
  if (OVERRIDES[slug]) return OVERRIDES[slug];
  // Default: capitalize each part
  return slug
    .split('-')
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join(' ');
}

export async function generateMetadata({ params }: Props) {
  const { slug, locale } = await params;
  const isAr = locale === 'ar';
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://examanet.com';
  const subjectName = slugToDisplayName(slug);

  // 2026-09-29 FIX: NO D1 call here. Previously called getCloudflareContext()
  // which caused 1102 CPU timeouts and broke the entire page (500).
  // The page component fetches the real subject.nameFr from D1 and renders it.

  return {
    title: isAr
      ? `Devoirs ${subjectName} — 7ème إلى الباك | Examanet`
      : `Devoirs ${subjectName} — 7ème à Bac | Examanet`,
    description: isAr
      ? `جميع واجبات ${subjectName} للسنة الدراسية التونسية: من السنة السابعة أساسي إلى الباكالوريا. تحميل مجاني.`
      : `Tous les devoirs ${subjectName} du programme tunisien, de la 7ème année au Baccalauréat. Téléchargement gratuit, PDFs par classe.`,
    alternates: {
      canonical: `${baseUrl}/${locale}/devoirs/${slug}`,
    },
    openGraph: {
      title: `Devoirs ${subjectName} | Examanet`,
      description: isAr
        ? ` واجبات ${subjectName} لكل المستويات`
        : `Devoirs ${subjectName} pour toutes les classes — 7ème, 8ème, 9ème, 1AS, 2AS, 3AS, Bac`,
      url: `${baseUrl}/${locale}/devoirs/${slug}`,
      type: 'website',
    },
  };
}

export default async function DevoirsLandingPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const sp = await searchParams;
  const classSlug = sp?.class || null;

  const ctx = await getCloudflareContext({ async: true });
  const db = (ctx as any).env?.DB;
  if (!db) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-slate-500">Service temporairement indisponible.</p>
      </div>
    );
  }

  // Resolve subject (need slug in result for breadcrumb + listing prop)
  const subject = await db
    .prepare('SELECT id, slug, nameFr, nameAr, color FROM "Subject" WHERE slug = ?')
    .bind(slug)
    .first();
  if (!subject) notFound();

  // Build WHERE clause
  const conditions = ["r.status = 'PUBLISHED'", "r.type = 'DEVOIR'", 'r.subjectId = ?'];
  const params_arr: any[] = [subject.id];
  let classRow = null;

  if (classSlug) {
    const c = await db
      .prepare('SELECT id, nameFr FROM "Class" WHERE slug = ?')
      .bind(classSlug)
      .first();
    if (c) {
      classRow = c;
      conditions.push('r.classId = ?');
      params_arr.push(c.id);
    }
  }

  const whereClause = conditions.join(' AND ');

  // Total count
  const totalRes = await db
    .prepare(`SELECT COUNT(*) as total FROM Resource r WHERE ${whereClause}`)
    .bind(...params_arr)
    .first();
  const total = Number(totalRes?.total || 0);

  // First page (24 items)
  const itemsRes = await db
    .prepare(
      [
        'SELECT r.id, r.numericId, r.slug, r.title, r.type, r.summary,',
        'r.viewsCount, r.downloadsCount, r.avgRating, r.ratingsCount,',
        'r.hasCorrection, r.year, r.thumbnailUrl, r.thumbnailKey,',
        'r.pageCount, r.fileSize, r.language, r.publishedAt,',
        's.slug as s_slug, s.nameFr as s_nameFr, s.color as s_color,',
        'c.slug as c_slug, c.nameFr as c_nameFr,',
        't.firstName as t_firstName, t.lastName as t_lastName',
        'FROM Resource r',
        'LEFT JOIN `Subject` s ON r.subjectId = s.id',
        'LEFT JOIN `Class` c ON r.classId = c.id',
        'LEFT JOIN `User` t ON r.teacherId = t.id',
        `WHERE ${whereClause}`,
        'ORDER BY r.publishedAt DESC',
        'LIMIT ? OFFSET ?',
      ].join('\n'),
    )
    .bind(...params_arr, 24, 0)
    .all();

  const items = (itemsRes.results || []).map((r: any) => ({
    id: r.id,
    numericId: r.numericId,
    slug: r.slug,
    title: r.title,
    type: r.type,
    summary: r.summary,
    viewsCount: r.viewsCount || 0,
    downloadsCount: r.downloadsCount || 0,
    avgRating: r.avgRating || 0,
    ratingCount: r.ratingsCount || 0,
    hasCorrection: !!r.hasCorrection,
    year: r.year,
    thumbnailUrl: r.thumbnailUrl,
    thumbnailKey: r.thumbnailKey,
    pageCount: r.pageCount,
    fileSize: r.fileSize,
    language: r.language,
    publishedAt: r.publishedAt,
    subject: r.s_slug ? { slug: r.s_slug, nameFr: r.s_nameFr, color: r.s_color } : null,
    class: r.c_slug ? { slug: r.c_slug, nameFr: r.c_nameFr } : null,
    teacher: r.t_firstName ? { firstName: r.t_firstName, lastName: r.t_lastName } : null,
  }));

  // All classes for tabs
  const allClassesRes = await db
    .prepare('SELECT slug, nameFr FROM "Class" ORDER BY numericId ASC')
    .all();
  const allClasses = (allClassesRes.results || []).map((c: any) => ({
    slug: c.slug,
    labelFr: c.nameFr,
  }));

  // JSON-LD ItemList
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://examanet.com';
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: `Devoirs ${subject.nameFr}${classRow ? ` — ${classRow.nameFr}` : ''}`,
    description: `Liste de devoirs ${subject.nameFr} téléchargeables gratuitement`,
    numberOfItems: total,
    itemListElement: items.slice(0, 10).map((item: any, idx: number) => ({
      '@type': 'ListItem',
      position: idx + 1,
      name: item.title,
      url: `${baseUrl}/fr/ressources/${item.numericId || item.id}/${item.slug}`,
    })),
  };

  return (
    <div className="min-h-screen bg-slate-50">
      {/* JSON-LD structured data */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      {/* HERO HEADER */}
      <header className="bg-gradient-to-br from-primary-700 via-primary-800 to-primary-950 text-white py-12 px-4">
        <div className="max-w-7xl mx-auto">
          <nav className="text-sm text-primary-100 mb-4 flex items-center gap-1 flex-wrap">
            <Link href="/" className="hover:text-white transition">
              Accueil
            </Link>
            <ChevronRight className="w-3 h-3 opacity-50" />
            <Link href="/matieres" className="hover:text-white transition">
              Matières
            </Link>
            <ChevronRight className="w-3 h-3 opacity-50" />
            <Link
              href={`/matieres/${subject.slug}`}
              className="hover:text-white transition"
            >
              {subject.nameFr}
            </Link>
            <ChevronRight className="w-3 h-3 opacity-50" />
            <span className="text-white font-semibold">Devoirs</span>
            {classRow && (
              <>
                <ChevronRight className="w-3 h-3 opacity-50" />
                <span className="text-white font-semibold">{classRow.nameFr}</span>
              </>
            )}
          </nav>

          <h1 className="text-3xl md:text-5xl font-extrabold leading-tight mb-3">
            Devoirs {subject.nameFr}
          </h1>
          <p className="text-primary-100 text-base md:text-lg max-w-3xl">
            {total.toLocaleString('fr-FR')} devoirs {subject.nameFr} téléchargeables gratuitement —
            de la 7ème année au Baccalauréat. PDFs avec corrigés, classés par classe et par année.
          </p>
        </div>
      </header>

      {/* MAIN CONTENT */}
      <main className="max-w-7xl mx-auto px-4 py-8">
        {/* 2026-09-29 FIX: wrap client component in Suspense because DevoirsListing
            uses useSearchParams(). Without a Suspense boundary, Next.js throws
            during SSR (500 error). */}
        <Suspense
          fallback={
            <div className="text-center py-20 text-slate-500">Chargement…</div>
          }
        >
          <DevoirsListing
            subject={{ slug: subject.slug, nameFr: subject.nameFr, color: subject.color }}
            classes={allClasses}
            initialItems={items}
            initialTotal={total}
            initialNextCursor={items.length < total ? items.length : null}
            initialClassSlug={classSlug}
          />
        </Suspense>
      </main>
    </div>
  );
}
