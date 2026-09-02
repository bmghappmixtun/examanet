import type { Metadata } from 'next';
import { getTranslations, getLocale } from 'next-intl/server';
import {
  courseSchema,
  faqSchema,
  breadcrumbSchema,
  itemListSchema,
  organizationSchema,
  SITE_URL,
} from '@/lib/structured-data';
import { Link } from '@/i18n/navigation';
import { ChevronRight } from 'lucide-react';
import ProgrammeOfficielClient from '@/components/programme-officiel/ProgrammeOfficielClient';

export const revalidate = 3600; // ISR: refresh hourly

const PAGE_PATH = '/programme-officiel';
const PAGE_URL_FR = `${SITE_URL}/fr${PAGE_PATH}`;
const PAGE_URL_AR = `${SITE_URL}/ar${PAGE_PATH}`;

// ============================================================================
// METADATA — Full SEO optimized
// ============================================================================
export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const isAr = locale === 'ar';

  const title = isAr
    ? 'البرنامج التعليمي التونسي 2025-2026 — الإعدادي والثانوي | وزارة التربية'
    : 'Programme Éducatif Tunisien 2025-2026 — Collège & Lycée | Ministère de l\'Éducation';
  
  const description = isAr
    ? '📚 البرنامج التعليمي التونسي الرسمي 2025-2026 من وزارة التربية. جميع مواد الإعدادي (السنة 7-9) والثانوي (1AS-4AS). محتوى مفصّل حسب القسم: 7 شعب للباكالوريا (رياضيات، علوم، تقنية، إعلامية، اقتصاد، آداب، رياضة)، 13 مادة، 4 محاور لكل مادة باكالوريا. مصادر رسمية: edunet.tn، cnp.com.tn، bac.com.tn.'
    : '📚 Programme éducatif officiel tunisien 2025-2026 du Ministère de l\'Éducation. Toutes les matières du collège (7-9ème) et du lycée (1AS-4AS). Contenu détaillé par section : 7 sections BAC (Math, Sciences, Technique, Informatique, Économie, Lettres, Sport), 13 matières, 4 thèmes par matière BAC. Sources officielles : edunet.tn, cnp.com.tn, bac.com.tn.';

  return {
    title,
    description,
    keywords: isAr
      ? [
          // Programme primaire
          'البرنامج التعليمي التونسي',
          'منهج وزارة التربية',
          'البرنامج الرسمي تونس',
          'مناهج تونس 2025',
          'مناهج تونس 2026',
          // Niveaux
          'البرنامج الإعدادي',
          'البرنامج الثانوي',
          'البرنامج الأساسي',
          'منهج السنة السابعة',
          'منهج السنة الثامنة',
          'منهج السنة التاسعة',
          'منهج الأولى ثانوي',
          'منهج الثانية ثانوي',
          'منهج الثالثة ثانوي',
          'منهج الباكالوريا',
          // Sections BAC
          'شعبة الرياضيات',
          'شعبة العلوم التجريبية',
          'شعبة العلوم التقنية',
          'شعبة علوم الإعلامية',
          'شعبة الاقتصاد والتصرف',
          'شعبة الآداب',
          'شعبة الرياضة',
          '7 شعب باكالوريا',
          // Matières
          'الرياضيات تونس',
          'الفيزياء تونس',
          'علوم الحياة والأرض',
          'الفلسفة تونس',
          'الفرنسية تونس',
          'الإنجليزية تونس',
          'العربية تونس',
          'الفلسفة الباكالوريا',
          'الإعلامية تونس',
          'التكنولوجيا تونس',
          'الاقتصاد والتصرف',
          // Collège
          'مناظرة التاسعة أساسي',
          'الثلاثي الأول',
          'الثلاثي الثاني',
          'الثلاثي الثالث',
          // Sources
          'edunet',
          'cnp',
          'bac.com.tn',
          'examanet',
          // Outils
          'منصة تعليمية تونسية',
          'موارد تعليمية مجانية',
        ]
      : [
          // Primary
          'programme éducatif tunisien',
          'programme officiel tunisie',
          'programme ministère éducation tunisie',
          'programme scolaire tunisien 2025',
          'programme scolaire tunisien 2026',
          // Niveaux
          'programme collège tunisien',
          'programme lycée tunisien',
          'programme 7ème année',
          'programme 8ème année',
          'programme 9ème année',
          'programme 1ère année secondaire',
          'programme 2ème année secondaire',
          'programme 3ème année secondaire',
          'programme bac tunisien',
          // Sections BAC
          'bac mathématique tunisie',
          'bac sciences expérimentales tunisie',
          'bac technique tunisie',
          'bac informatique tunisie',
          'bac economie gestion tunisie',
          'bac lettres tunisie',
          'bac sport tunisie',
          '7 sections bac tunisien',
          // Matières
          'mathématiques programme tunisie',
          'physique programme tunisie',
          'svt programme tunisie',
          'philosophie programme tunisie',
          'français programme tunisie',
          'anglais programme tunisie',
          'arabe programme tunisie',
          'informatique programme tunisie',
          'technologie programme tunisie',
          'economie programme tunisie',
          'gestion programme tunisie',
          'histoire geo programme tunisie',
          'éducation islamique programme tunisie',
          // Trimestre
          'trimestre 1',
          'trimestre 2',
          'trimestre 3',
          // Sources
          'edunet',
          'cnp',
          'bac.com.tn',
          'examanet',
          // Tools
          'plateforme éducative tunisie',
          'ressources éducatives gratuites',
        ],
    authors: [{ name: 'Ministère de l\'Éducation Tunisien' }, { name: 'Examanet' }],
    creator: 'Examanet',
    publisher: 'Examanet',
    category: isAr ? 'تعليم' : 'Éducation',
    alternates: {
      canonical: isAr ? PAGE_URL_AR : PAGE_URL_FR,
      languages: {
        'fr-TN': PAGE_URL_FR,
        'ar-TN': PAGE_URL_AR,
        'x-default': PAGE_URL_FR,
      },
    },
    openGraph: {
      title,
      description,
      url: isAr ? PAGE_URL_AR : PAGE_URL_FR,
      siteName: 'Examanet',
      locale: isAr ? 'ar_TN' : 'fr_TN',
      alternateLocale: isAr ? ['fr_TN'] : ['ar_TN'],
      type: 'website',
      images: [
        {
          url: '/api/og/page/programme-officiel',
          width: 1200,
          height: 630,
          alt: isAr
            ? 'البرنامج التعليمي التونسي 2025-2026 — وزارة التربية التونسية'
            : 'Programme Éducatif Tunisien 2025-2026 — Ministère de l\'Éducation Tunisien',
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: ['/api/og/page/programme-officiel'],
      creator: '@examanet',
      site: '@examanet',
    },
    robots: {
      index: true,
      follow: true,
      googleBot: {
        index: true,
        follow: true,
        'max-snippet': -1,
        'max-image-preview': 'large',
        'max-video-preview': -1,
      },
    },
    other: {
      'geo.region': 'TN',
      'geo.placename': 'Tunisia',
      'DC.title': title,
      'DC.description': description,
      'DC.language': isAr ? 'ar-TN' : 'fr-TN',
      'DC.creator': 'Examanet',
      'DC.publisher': 'Examanet',
      'DC.type': 'Text.Education',
      'DC.subject': isAr ? 'البرنامج التعليمي التونسي' : 'Programme éducatif tunisien',
    },
  };
}

// ============================================================================
// PAGE — Top SEO with multiple structured data
// ============================================================================
export default async function ProgrammeOfficielPage() {
  const t = await getTranslations();
  const locale = await getLocale();
  const isAr = locale === 'ar';

  // ==========================================================================
  // STRUCTURED DATA — 5 schemas for maximum SEO
  // ==========================================================================

  // 1. Breadcrumb
  const breadcrumbJsonLd = breadcrumbSchema([
    { name: 'Accueil', url: SITE_URL },
    { name: 'Programme Officiel', url: isAr ? PAGE_URL_AR : PAGE_URL_FR },
  ]);

  // 2. Organization (Examanet)
  const organizationJsonLd = organizationSchema();

  // 3. Course schema for the educational content
  const courseJsonLd = courseSchema({
    slug: 'programme-officiel-tunisien-2025-2026',
    title: isAr ? 'البرنامج التعليمي التونسي 2025-2026' : 'Programme Éducatif Tunisien 2025-2026',
    description: isAr
      ? 'البرنامج التعليمي الرسمي لوزارة التربية التونسية لجميع المستويات'
      : 'Programme éducatif officiel du Ministère de l\'Éducation tunisien pour tous les niveaux',
    language: isAr ? 'ar-TN' : 'fr-TN',
    level: isAr ? 'الإعدادي والثانوي' : 'Collège et Lycée',
    cycle: isAr ? 'التعليم الأساسي والثانوي' : 'Enseignement de base et secondaire',
    subject: isAr ? 'جميع المواد' : 'Toutes les matières',
    type: 'Curriculum',
    url: isAr ? PAGE_URL_AR : PAGE_URL_FR,
    datePublished: '2024-09-01',
    dateModified: new Date().toISOString(),
  });

  // 4. ItemList for 7 BAC sections
  const bacSections = [
    { key: 'mathematiques', fr: 'Mathématiques', ar: 'الرياضيات', desc: 'Algèbre, analyse, géométrie, probabilités', descAr: 'الجبر، التحليل، الهندسة، الاحتمالات' },
    { key: 'sciences-experimentales', fr: 'Sciences Expérimentales', ar: 'العلوم التجريبية', desc: 'Math, physique, SVT', descAr: 'رياضيات، فيزياء، علوم الحياة والأرض' },
    { key: 'sciences-techniques', fr: 'Sciences Techniques', ar: 'العلوم التقنية', desc: 'Math, physique, technologie', descAr: 'رياضيات، فيزياء، تكنولوجيا' },
    { key: 'sciences-informatique', fr: 'Sciences de l\'Informatique', ar: 'علوم الإعلامية', desc: 'Algorithmique, bases de données', descAr: 'الخوارزميات، قواعد البيانات' },
    { key: 'eco-gestion', fr: 'Économie et Gestion', ar: 'الاقتصاد والتصرف', desc: 'Économie, gestion, math financières', descAr: 'الاقتصاد، التصرف، الرياضيات المالية' },
    { key: 'lettres', fr: 'Lettres', ar: 'الآداب', desc: 'Arabe, français, philo, histoire', descAr: 'العربية، الفرنسية، الفلسفة، التاريخ' },
    { key: 'sport', fr: 'Sport', ar: 'الرياضة', desc: 'EPS, sciences, math', descAr: 'التربية البدنية، العلوم، الرياضيات' },
  ];
  const sectionsJsonLd = itemListSchema({
    name: isAr ? 'الشعب السبع للباكالوريا التونسية' : 'Les 7 sections du Baccalauréat tunisien',
    description: isAr
      ? 'قائمة كاملة بشعب الباكالوريا التونسية السبع الرسمية'
      : 'Liste complète des 7 sections officielles du Baccalauréat tunisien',
    url: isAr ? PAGE_URL_AR : PAGE_URL_FR,
    items: bacSections.map((s) => ({
      name: isAr ? s.ar : s.fr,
      url: `${isAr ? PAGE_URL_AR : PAGE_URL_FR}#section-${s.key}`,
      description: isAr ? s.descAr : s.desc,
    })),
  });

  // 5. FAQ schema
  const faqs = isAr
    ? [
        {
          question: 'ما هو البرنامج التعليمي التونسي الرسمي؟',
          answer: 'البرنامج التعليمي التونسي هو المنهج الرسمي لوزارة التربية التونسية لجميع المستويات التعليمية. يشمل المرحلة الإعدادية (السنة 7-9) والمرحلة الثانوية (الأولى إلى الرابعة ثانوي). يحدد البرنامج المواد والمحتوى التعليمي الرسمي لكل مستوى وقسم. متاح على بوابة إيدونت (edunet.tn) والمركز الوطني البيداغوجي (cnp.com.tn).',
        },
        {
          question: 'كم عدد شعب الباكالوريا التونسية؟',
          answer: 'الباكالوريا التونسية تحتوي على 7 شعب رسمية: الرياضيات، العلوم التجريبية، العلوم التقنية، علوم الإعلامية، الاقتصاد والتصرف، الآداب، الرياضة. كل شعبة لها برنامجها الخاص من 3 إلى 4 محاور دراسية.',
        },
        {
          question: 'ما هي المواد التي تُدرَّس في الإعدادي؟',
          answer: 'في المرحلة الإعدادية التونسية (السنة 7-9)، تُدرَّس 10 مواد أساسية: الرياضيات، الفيزياء، علوم الحياة والأرض، التكنولوجيا، الإعلامية، العربية، الفرنسية، الإنجليزية، التاريخ والجغرافيا، التربية الإسلامية.',
        },
        {
          question: 'ما الفرق بين الباكالوريا وشهادة البريفيه؟',
          answer: 'الباكالوريا هي شهادة نهاية التعليم الثانوي (الصف 4AS) في تونس. البريفيه هو امتحان نهاية التعليم الأساسي (الصف 9ème) ويُسمَّى مناظرة ختم التعليم الأساسي. كلاهما شرط للالتحاق بالتعليم العالي.',
        },
        {
          question: 'هل المواد في الإعدادي تُدرَّس بالعربية أم الفرنسية؟',
          answer: 'في الإعدادي التونسي، تُدرَّس معظم المواد بالعربية: الرياضيات، الفيزياء، علوم الحياة والأرض، التكنولوجيا، التاريخ والجغرافيا، التربية الإسلامية، العربية. تُدرَّس الإعلامية والفرنسية بالفرنسية، والإنجليزية بالإنجليزية.',
        },
        {
          question: 'ما هو محتوى الباكالوريا في شعبة الرياضيات؟',
          answer: 'شعبة الرياضيات في الباكالوريا التونسية تتكون من 5 محاور رئيسية: النهايات والاتصال، الاشتقاق والتطبيقات، الدوال الأصلية والتكامل، الأعداد العقدية، الهندسة في الفضاء. مدة كل محور من 15 إلى 30 ساعة.',
        },
      ]
    : [
        {
          question: 'Quel est le programme éducatif officiel tunisien ?',
          answer: 'Le programme éducatif tunisien est le curriculum officiel du Ministère de l\'Éducation tunisien pour tous les niveaux. Il couvre le collège (7-9ème année) et le lycée (1ère à 4ème année). Il définit les matières et le contenu pédagogique officiel pour chaque niveau et section. Disponible sur edunet.tn et cnp.com.tn.',
        },
        {
          question: 'Combien de sections compte le Baccalauréat tunisien ?',
          answer: 'Le Baccalauréat tunisien compte 7 sections officielles : Mathématiques, Sciences Expérimentales, Sciences Techniques, Sciences de l\'Informatique, Économie-Gestion, Lettres, Sport. Chaque section a son propre programme de 3 à 4 thèmes.',
        },
        {
          question: 'Quelles sont les matières enseignées au collège en Tunisie ?',
          answer: 'Au collège tunisien (7-9ème année), 10 matières sont enseignées : Mathématiques, Physique, Sciences de la Vie et de la Terre (SVT), Technologie, Informatique, Arabe, Français, Anglais, Histoire-Géographie, Éducation Islamique.',
        },
        {
          question: 'Quelle est la différence entre le Bac et le Brevet en Tunisie ?',
          answer: 'Le Baccalauréat est le diplôme de fin d\'études secondaires (4ème année). Le Brevet (ou concours 9ème) est l\'examen de fin d\'études du collège. Les deux sont requis pour accéder à l\'enseignement supérieur.',
        },
        {
          question: 'Les matières du collège sont enseignées en arabe ou en français ?',
          answer: 'Au collège tunisien, la plupart des matières sont enseignées en arabe : Mathématiques, Physique, SVT, Technologie, Histoire-Géographie, Éducation Islamique, Arabe. L\'Informatique et le Français sont en français, l\'Anglais en anglais.',
        },
        {
          question: 'Quel est le contenu du Bac Mathématiques en Tunisie ?',
          answer: 'La section Mathématiques du Bac tunisien comprend 5 thèmes principaux : Limites et continuité, Dérivation et applications, Primitives et calcul intégral, Nombres complexes, Géométrie dans l\'espace. Chaque thème dure entre 15 et 30 heures.',
        },
        {
          question: 'Quelles sont les sources officielles du programme tunisien ?',
          answer: 'Les sources officielles sont : edunet.tn (portail du Ministère de l\'Éducation), education.gov.tn (site du Ministère), cnp.com.tn (Centre National Pédagogique pour les manuels), bac.com.tn (spécialisé pour le Baccalauréat).',
        },
      ];
  const faqJsonLd = faqSchema(faqs);

  const allSchemas = [
    breadcrumbJsonLd,
    organizationJsonLd,
    courseJsonLd,
    sectionsJsonLd,
    faqJsonLd,
  ];

  return (
    <>
      {/* Multiple structured data schemas for maximum SEO */}
      {allSchemas.map((schema, i) => (
        <script
          key={i}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
        />
      ))}
      <ProgrammeOfficielClient />
    </>
  );
}
