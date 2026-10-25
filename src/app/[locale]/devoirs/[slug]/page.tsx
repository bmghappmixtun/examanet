// @ts-nocheck
/**
 * /[locale]/devoirs/[slug] — APEX DESIGN for DEVOIRS.
 * Filtered by cycle (Collège / Lycée) via ?cycle=college|lycee.
 */
import { notFound } from 'next/navigation';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import ApexHero from '@/components/preview-devoirs2/ApexHero';
import ApexListing from '@/components/preview-devoirs2/ApexListing';
import { DevoirsFilterProvider } from '@/components/preview-devoirs2/devoirs-context';
import styles from '@/components/preview-devoirs2/apex-devoirs.module.css';
import { getSubjectDisplayName } from '@/lib/subject-cycle-name';

export const revalidate = 300;

interface Props {
  params: Promise<{ slug: string; locale: string }>;
  searchParams: Promise<{ class?: string; cycle?: string; trimestre?: string; subtype?: string; number?: string }>;
}

const FAQ_ITEMS = [
  { q: `Qu'est-ce qu'un devoir de contrôle en {SUBJECT} ?`, a: 'Un devoir de contrôle est une évaluation ponctuelle...' },
  { q: `Quelle est la différence entre devoir de contrôle et devoir de synthèse ?`, a: 'Le contrôle porte sur une séquence limitée...' },
  { q: `Comment bien préparer un devoir de {SUBJECT} ?`, a: 'Révisez le cours, faites les exercices...' },
  { q: `Les devoirs sont-ils gratuits ?`, a: 'Oui, 100% gratuits sur Examanet.' },
];

export async function generateMetadata({ params }: Props) {
  const { slug, locale } = await params;
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://examanet.com';
  // 2026-10-25: NE PAS ajouter "| Examanet" ici. Le layout [locale] applique
  // déjà `template: '%s | Examanet'` (src/app/[locale]/layout.tsx:84) → on
  // obtenait « Devoirs histoire-geographie | Examanet | Examanet » en double.
  return {
    title: `Devoirs ${slug}`,
    alternates: { canonical: `${baseUrl}/${locale}/devoirs/${slug}` },
  };
}

export default async function ApexDevoirsPage({ params, searchParams }: Props) {
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
  let totalCountQuery = "SELECT COUNT(*) as c FROM Resource WHERE status='PUBLISHED' AND type='DEVOIR' AND subjectId = ?";
  const totalCountBindings: any[] = [subject.id];
  if (cycleParam && CYCLE_CLASS_SLUGS[cycleParam]) {
    const slugs = CYCLE_CLASS_SLUGS[cycleParam];
    const placeholders = slugs.map(() => '?').join(',');
    totalCountQuery += ` AND classId IN (SELECT id FROM "Class" WHERE slug IN (${placeholders}))`;
    totalCountBindings.push(...slugs);
  }
  const totalRes = await db.prepare(totalCountQuery).bind(...totalCountBindings).first();
  const totalCount = Number(totalRes?.c || 0);

  // 2026-10-25: le compteur de trimestres était calculé SANS le filtre de
  // cycle (donc sur toutes les classes) et la colonne `trimestre` est quasi
  // NULL sur ces ressources → il affichait « 1 TRIMESTRES » partout, y compris
  // quand la page n'affichait qu'1 devoir. On aligne sur le même WHERE que le
  // total, cycle compris.
  let trimCountQuery =
    "SELECT COUNT(DISTINCT `trimester`) as c FROM Resource WHERE status='PUBLISHED' AND type='DEVOIR' AND subjectId = ? AND `trimester` IS NOT NULL";
  const trimCountBindings: any[] = [subject.id];
  if (cycleParam && CYCLE_CLASS_SLUGS[cycleParam]) {
    const slugs = CYCLE_CLASS_SLUGS[cycleParam];
    const placeholders = slugs.map(() => '?').join(',');
    trimCountQuery += ` AND classId IN (SELECT id FROM "Class" WHERE slug IN (${placeholders}))`;
    trimCountBindings.push(...slugs);
  }
  const trimCountRes = await db.prepare(trimCountQuery).bind(...trimCountBindings).first();
  const trimesterCount = Number(trimCountRes?.c || 0);

  // 2026-10-25: le compteur de CLASSES affichait le nombre total de classes
  // du système (7) — donc « 7 CLASSES » quelle que soit la matière, y compris
  // pour une matière qui n'existe qu'en 4ème. On compte les classes qui
  // possessing RÉELLEMENT des devoirs de cette matière (cycle compris).
  let classCountQuery =
    "SELECT COUNT(DISTINCT classId) as c FROM Resource WHERE status='PUBLISHED' AND type='DEVOIR' AND subjectId = ?";
  const classCountBindings: any[] = [subject.id];
  if (cycleParam && CYCLE_CLASS_SLUGS[cycleParam]) {
    const slugs = CYCLE_CLASS_SLUGS[cycleParam];
    const placeholders = slugs.map(() => '?').join(',');
    classCountQuery += ` AND classId IN (SELECT id FROM "Class" WHERE slug IN (${placeholders}))`;
    classCountBindings.push(...slugs);
  }
  const classCountRes = await db.prepare(classCountQuery).bind(...classCountBindings).first();
  const classCount = Number(classCountRes?.c || 0);

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
      { '@type': 'ListItem', position: 4, name: 'Devoirs', item: `${baseUrl}/fr/devoirs/${subject.slug}` },
    ]},
    { '@context': 'https://schema.org', '@type': 'Course', name: `Devoirs ${subjectNameFr}`, description: 'Programme tunisien' },
    { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: faqContent },
    { '@context': 'https://schema.org', '@type': 'WebPage', name: `Devoirs ${subjectNameFr}`, speakable: { '@type': 'SpeakableSpecification', xpath: ['/html/head/title', '/html/body//h1'] } },
  ];

  return (
    <div>
      {jsonLd.map((schema, idx) => (
        <script key={idx} type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }} />
      ))}

      <DevoirsFilterProvider initialCycle={cycleParam}>
        <ApexHero
          type="Devoirs"
          subject={subject}
          totalCount={totalCount}
          classCount={classCount}
          trimesterCount={trimesterCount}
          classes={allClasses}
          activeClass={classSlug}
          activeCycle={cycleParam}
        />
        <div style={{ maxWidth: 1400, margin: '0 auto', padding: '0 0 4rem' }}>
          <ApexListing type="Devoirs" subject={subject} classes={allClasses} activeCycle={cycleParam} />
        </div>
      </DevoirsFilterProvider>

      <section className={styles.faqSection}>
        <h2>Questions fréquentes sur les devoirs de {subjectNameFr}</h2>
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
