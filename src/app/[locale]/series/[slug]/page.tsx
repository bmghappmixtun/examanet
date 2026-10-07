// @ts-nocheck
/**
 * /[locale]/series/[slug] — APEX DESIGN for SÉRIES D'EXERCICES.
 * Filtered by cycle (Collège / Lycée) via ?cycle=college|lycee.
 */
import { notFound } from 'next/navigation';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import ApexHero from '@/components/preview-series2/ApexHero';
import ApexListing from '@/components/preview-series2/ApexListing';
import { SeriesFilterProvider } from '@/components/preview-series2/series-context';
import styles from '@/components/preview-series2/apex-series.module.css';
import { getSubjectDisplayName } from '@/lib/subject-cycle-name';

export const revalidate = 300;

interface Props {
  params: Promise<{ slug: string; locale: string }>;
  searchParams: Promise<{ class?: string; cycle?: string; trimestre?: string }>;
}

const FAQ_ITEMS = [
  { q: `Qu'est-ce qu'une série d'exercices en {SUBJECT} ?`, a: "Une série regroupe plusieurs exercices pour s'entraîner sur une notion ou un chapitre." },
  { q: `Comment choisir une série d'exercices ?`, a: 'Filtrez par classe et par trimestre pour cibler le bon niveau.' },
  { q: `Les séries sont-elles gratuites ?`, a: 'Oui, 100% gratuites sur Examanet.' },
  { q: `Y a-t-il des corrigés ?`, a: 'Oui, certains documents sont accompagnés de corrigés.' },
];

export async function generateMetadata({ params }: Props) {
  const { slug, locale } = await params;
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://examanet.com';
  return {
    title: `Séries ${slug} | Examanet`,
    alternates: { canonical: `${baseUrl}/${locale}/series/${slug}` },
  };
}

export default async function ApexSeriesPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const sp = await searchParams;
  const classSlug = sp?.class || null;
  const cycleParam = sp?.cycle || null;

  const ctx = await getCloudflareContext({ async: true });
  const db = (ctx as any).env?.DB;
  if (!db) return <div>DB unavailable</div>;

  const subject: any = await db
    .prepare('SELECT id, slug, nameFr, nameAr, color FROM "Subject" WHERE slug = ?')
    .bind(slug)
    .first();
  if (!subject) notFound();

  // Cycle-specific display name override (e.g. Technologie → Sciences Techniques at lycée)
  subject.nameFr = getSubjectDisplayName(subject.slug, subject.nameFr, cycleParam);

  const allClassesRes = await db
    .prepare('SELECT slug, nameFr FROM "Class" ORDER BY numericId ASC')
    .all();
  const allClasses = (allClassesRes.results || []).map((c: any) => ({ slug: c.slug, labelFr: c.nameFr }));

  // Cycle-filtered total count (2026-10-06)
  const CYCLE_CLASS_SLUGS: Record<string, string[]> = {
    college: ['7eme', '8eme', '9eme'],
    lycee: ['1ere-secondaire', '2eme-secondaire', '3eme-secondaire', '4eme-secondaire'],
  };
  let totalCountQuery = "SELECT COUNT(*) as c FROM Resource WHERE status='PUBLISHED' AND type='EXERCISE' AND subjectId = ?";
  const totalCountBindings: any[] = [subject.id];
  if (cycleParam && CYCLE_CLASS_SLUGS[cycleParam]) {
    const slugs = CYCLE_CLASS_SLUGS[cycleParam];
    const placeholders = slugs.map(() => '?').join(',');
    totalCountQuery += ` AND classId IN (SELECT id FROM "Class" WHERE slug IN (${placeholders}))`;
    totalCountBindings.push(...slugs);
  }
  const totalRes = await db.prepare(totalCountQuery).bind(...totalCountBindings).first();
  const totalCount = Number(totalRes?.c || 0);

  const trimCountRes = await db
    .prepare("SELECT COUNT(DISTINCT `trimester`) as c FROM Resource WHERE status='PUBLISHED' AND type='EXERCISE' AND subjectId = ? AND `trimester` IS NOT NULL")
    .bind(subject.id)
    .first();
  const trimesterCount = Number(trimCountRes?.c || 0);

  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://examanet.com';
  const subjectNameFr = subject.nameFr;
  const faqContent = FAQ_ITEMS.map((item) => ({
    '@type': 'Question',
    name: item.q.replace('{SUBJECT}', subjectNameFr),
    acceptedAnswer: { '@type': 'Answer', text: item.a },
  }));

  const jsonLd = [
    { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Accueil', item: `${baseUrl}/fr` },
      { '@type': 'ListItem', position: 2, name: 'Matières', item: `${baseUrl}/fr/matieres` },
      { '@type': 'ListItem', position: 3, name: subjectNameFr, item: `${baseUrl}/fr/matieres/${subject.slug}` },
      { '@type': 'ListItem', position: 4, name: 'Séries', item: `${baseUrl}/fr/series/${subject.slug}` },
    ]},
    { '@context': 'https://schema.org', '@type': 'Course', name: `Séries d'exercices ${subjectNameFr}`, description: 'Programme tunisien' },
    { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: faqContent },
    { '@context': 'https://schema.org', '@type': 'WebPage', name: `Séries ${subjectNameFr}`, speakable: { '@type': 'SpeakableSpecification', xpath: ['/html/head/title', '/html/body//h1'] } },
  ];

  return (
    <div>
      {jsonLd.map((schema, idx) => (
        <script key={idx} type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }} />
      ))}

      <SeriesFilterProvider initialCycle={cycleParam}>
        <ApexHero
          type="Séries"
          subject={subject}
          totalCount={totalCount}
          classCount={allClasses.length}
          trimesterCount={trimesterCount}
          classes={allClasses}
          activeClass={classSlug}
          activeCycle={cycleParam}
        />
        <div style={{ maxWidth: 1400, margin: '0 auto', padding: '0 0 4rem' }}>
          <ApexListing subject={subject} classes={allClasses} activeCycle={cycleParam} />
        </div>
      </SeriesFilterProvider>

      <section className={styles.faqSection}>
        <h2>Questions fréquentes sur les séries d'exercices de {subjectNameFr}</h2>
        <div className={styles.faq}>
          {FAQ_ITEMS.map((item, idx) => (
            <details key={idx}>
              <summary>{item.q.replace('{SUBJECT}', subjectNameFr)}</summary>
              <p>{item.a}</p>
            </details>
          ))}
        </div>
      </section>
    </div>
  );
}
