/**
 * JSON-LD structured data helpers for SEO.
 * All helpers return plain objects ready to be JSON-stringified and embedded
 * via <script type="application/ld+json"> in a page or layout.
 *
 * See: https://schema.org for type definitions
 */

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://examanet.com';
const SITE_NAME = 'Examanet';
const SITE_DESCRIPTION =
  'Cours, devoirs, séries, révisions, sujets bac et corrigés — 100% gratuits pour les élèves du Primaire, Collège et Lycée en Tunisie.';

export type BreadcrumbItem = {
  name: string;
  url: string;
};

/**
 * Organization + WebSite + SearchAction — embed in root layout.
 * Enables Google's knowledge panel, sitelinks searchbox, and rich SERP display.
 */
export function organizationSchema() {
  return [
    {
      '@context': 'https://schema.org',
      '@type': 'Organization',
      '@id': `${SITE_URL}#organization`,
      name: SITE_NAME,
      alternateName: 'Examanet Tunisie',
      url: SITE_URL,
      logo: {
        '@type': 'ImageObject',
        url: `${SITE_URL}/logo-transparent.png`,
        width: 269,
        height: 73,
      },
      description: SITE_DESCRIPTION,
      foundingDate: '2026',
      areaServed: {
        '@type': 'Country',
        name: 'Tunisia',
      },
      inLanguage: ['fr', 'ar'],
      sameAs: [
        // Add social links when available — currently empty
      ],
    },
    {
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      '@id': `${SITE_URL}#website`,
      url: SITE_URL,
      name: SITE_NAME,
      description: SITE_DESCRIPTION,
      inLanguage: ['fr', 'ar'],
      publisher: { '@id': `${SITE_URL}#organization` },
      potentialAction: {
        '@type': 'SearchAction',
        target: {
          '@type': 'EntryPoint',
          urlTemplate: `${SITE_URL}/recherche?q={search_term_string}`,
        },
        'query-input': 'required name=search_term_string',
      },
    },
  ];
}

/**
 * BreadcrumbList — for the visual breadcrumb in SERPs.
 * Pass items in order from root to current page.
 *
 * Defensive: ensures `name` is always present (required by Google).
 * Falls back to URL slug if name is missing/empty.
 */
/**
 * BreadcrumbList — for the visual breadcrumb in SERPs.
 * Pass items in order from root to current page.
 *
 * Defensive: ensures `name` is always present (required by Google).
 * Falls back to URL slug if name is missing/empty.
 *
 * SEO 2026-08-22: if `locale` is passed, prepends the locale segment to
 * each item URL so the breadcrumb points to the actual page the user is
 * on, not the locale-agnostic root path. This fixes the audit finding
 * "BreadcrumbList schema uses root URLs instead of locale-aware URLs".
 */
export function breadcrumbSchema(items: BreadcrumbItem[], locale?: 'fr' | 'ar') {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => {
      // Ensure name is never empty/null (Google Search Console requires it)
      let name = (item.name || '').toString().trim();
      if (!name) {
        // Fallback: derive from URL path
        try {
          const u = new URL(item.url);
          const path = u.pathname.replace(/^\/+|\/+$/g, '');
          name = path ? path.split('/').pop() || path : u.hostname;
          // Capitalize for display
          name = name.charAt(0).toUpperCase() + name.slice(1).replace(/-/g, ' ');
        } catch {
          name = `Page ${index + 1}`;
        }
      }
      // Localize URL: prepend /fr or /ar to the path so the breadcrumb
      // points to the locale-specific page. Skip if the URL already has
      // a locale prefix (or if it's the site root with no path).
      let localizedUrl = item.url;
      if (locale && item.url.startsWith(SITE_URL)) {
        const path = item.url.slice(SITE_URL.length);
        if (path && !/^\/(fr|ar)(\/|$)/.test(path)) {
          localizedUrl = `${SITE_URL}/${locale}${path === '/' ? '' : path}`;
        }
      }
      return {
        '@type': 'ListItem',
        position: index + 1,
        name,
        item: localizedUrl,
      };
    }),
  };
}

/**
 * Person schema for a teacher profile page.
 */
export function personSchema(opts: {
  id: string;
  name: string;
  description?: string | null;
  url: string;
  schoolName?: string | null;
  schoolNameAr?: string | null;
  resourceCount?: number;
  subjects?: string[];
}) {
  const data: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Person',
    '@id': opts.id,
    name: opts.name,
    url: opts.url,
    worksFor: opts.schoolName
      ? { '@type': 'EducationalOrganization', name: opts.schoolName }
      : { '@type': 'EducationalOrganization', name: 'Examanet', url: SITE_URL },
    affiliation: { '@id': `${SITE_URL}#organization` },
  };
  if (opts.description) data.description = opts.description;
  if (opts.resourceCount && opts.subjects?.length) {
    data.knowsAbout = opts.subjects;
    data.alumniOf = undefined;
  }
  return data;
}

/**
 * Course schema — for resource pages (extends LearningResource).
 * Adds educational specifics like syllabus, courseMode, etc.
 */
export function courseSchema(opts: {
  slug: string;
  title: string;
  description: string;
  language: string;
  level: string; // "9ème année de base" or "2ème année secondaire"
  cycle: string; // "Enseignement de base" or "Enseignement Secondaire"
  subject: string;
  type: string; // COURSE / DEVOIR / EXERCISE / etc.
  year?: string | null;
  teacher?: string | null;
  /** Teacher name in Arabic (الأستاذ) — for SEO/display. NOT a User FK. */
  teacherAr?: string | null;
  url: string;
  datePublished: string;
  dateModified: string;
  aggregateRating?: { ratingCount: number; ratingValue: number } | null;
  tags?: string | null; // comma-separated tags
  generalSubject?: string | null; // الموضوع العام — AI-extracted topic, boosts SEO discoverability
}) {
  // Build a clean, SEO-optimized description that includes the general subject
  // and the first paragraph of the AI summary (if any). The subject is one of
  // the strongest ranking signals for educational queries.
  const stripHtml = (s: string) => s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const cleanDesc = stripHtml(opts.description).slice(0, 460);
  const gs = opts.generalSubject ? stripHtml(opts.generalSubject).slice(0, 80) : null;
  // Prefix with general subject when present so it appears early in the snippet
  // (Google typically displays the first 150-160 chars of the meta description).
  const seoDescription = gs
    ? `${gs}. ${cleanDesc}`.slice(0, 500)
    : cleanDesc;
  const data: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Course',
    name: opts.title,
    description: seoDescription,
    url: opts.url,
    inLanguage: opts.language,
    educationalLevel: opts.level,
    isAccessibleForFree: true,
    provider: { '@id': `${SITE_URL}#organization` },
    hasCourseInstance: {
      '@type': 'CourseInstance',
      courseMode: 'online',
      courseWorkload: 'PT1H',
      inLanguage: opts.language,
      instructor: opts.teacher
        ? {
            '@type': 'Person',
            name: opts.teacher,
            // Add the AR name (alternateName) when available — helps multilingual SEO
            // and gives search engines an extra signal about the resource creator.
            ...(opts.teacherAr ? { alternateName: opts.teacherAr } : {}),
          }
        : undefined,
      offers: {
        '@type': 'Offer',
        price: '0',
        priceCurrency: 'TND',
        availability: 'https://schema.org/InStock',
      },
    },
    about: opts.subject,
    keywords: (() => {
      const tagList = opts.tags
        ? opts.tags
            .split(',')
            .map((t: string) => t.trim())
            .filter(Boolean)
        : [];
      const auto = [
        opts.subject,
        opts.level,
        opts.cycle,
        opts.type,
        'Tunisie',
        'examanet',
      ].filter(Boolean) as string[];
      // Insert the general subject FIRST (most specific / long-tail keyword)
      // then tags, then auto keywords. Max 15 to stay focused.
      const head = gs ? [gs] : [];
      return Array.from(new Set([...head, ...tagList, ...auto]))
        .slice(0, 15)
        .join(', ');
    })(),
    datePublished: opts.datePublished,
    dateModified: opts.dateModified,
    isPartOf: { '@id': `${SITE_URL}#website` },
  };
  // SEO: surface the general subject as a `teaches` field (schema.org/DefinedTerm)
  // so search engines understand what topic the resource actually covers. Falls
  // back gracefully when no general subject is set.
  if (gs) {
    data.teaches = {
      '@type': 'DefinedTerm',
      name: gs,
      inDefinedTermSet: opts.subject,
    };
  }
  // Add AggregateRating only if there are ratings (don't show 0-star in SERPs)
  if (opts.aggregateRating && opts.aggregateRating.ratingCount > 0) {
    data.aggregateRating = {
      '@type': 'AggregateRating',
      ratingValue: opts.aggregateRating.ratingValue,
      ratingCount: opts.aggregateRating.ratingCount,
      bestRating: 5,
      worstRating: 1,
    };
  }
  return data;
}

/**
 * ItemList schema — for /niveaux, /matieres, /professeurs, /ressources pages.
 */
export function itemListSchema(opts: {
  name: string;
  description?: string;
  url: string;
  items: Array<{ name: string; url: string; description?: string }>;
}) {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: opts.name,
    description: opts.description,
    url: opts.url,
    numberOfItems: opts.items.length,
    itemListElement: opts.items.slice(0, 50).map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      url: item.url,
      description: item.description,
    })),
  };
}

/**
 * FAQPage schema — for /faq page.
 */
export function faqSchema(faqs: Array<{ question: string; answer: string }>) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((faq) => ({
      '@type': 'Question',
      name: faq.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: faq.answer,
      },
    })),
  };
}

export { SITE_URL, SITE_NAME, SITE_DESCRIPTION };

/**
 * Quiz schema — for EXAM and DEVOIR resources.
 * Helps Google understand test/exam content and surface it in educational SERPs.
 * Extends Course with the educational assessment type.
 */
export function quizSchema(opts: {
  slug: string;
  title: string;
  description: string;
  language: string;
  level: string;
  subject: string;
  type: string;
  url: string;
  datePublished: string;
  dateModified: string;
  teacher?: string | null;
  teacherAr?: string | null;
  /** Total number of questions in the quiz/exam. */
  numberOfQuestions?: number;
  /** Time expected to complete, e.g. "PT2H" (2 hours). */
  timeRequired?: string;
  /** For exams: typical exam duration */
  estimatedDuration?: string;
}) {
  const data: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Quiz',
    name: opts.title,
    description: opts.description,
    url: opts.url,
    inLanguage: opts.language,
    educationalLevel: opts.level,
    about: opts.subject,
    provider: { '@id': `${SITE_URL}#organization` },
    isAccessibleForFree: true,
    hasPart: {
      '@type': 'Assessment',
      name: opts.title,
      ...(opts.numberOfQuestions ? { numberOfQuestions: opts.numberOfQuestions } : {}),
      ...(opts.timeRequired ? { timeRequired: opts.timeRequired } : {}),
    },
    datePublished: opts.datePublished,
    dateModified: opts.dateModified,
    isPartOf: { '@id': `${SITE_URL}#website` },
  };
  if (opts.teacher) {
    data.author = {
      '@type': 'Person',
      name: opts.teacher,
      ...(opts.teacherAr ? { alternateName: opts.teacherAr } : {}),
    };
  }
  return data;
}
