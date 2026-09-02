/**
 * Configuration riche des matières scolaires tunisiennes.
 * Chaque entrée contient :
 *   - design : gradient, emoji, icône Lucide, motif
 *   - seo    : title, description, keywords FR/AR
 *   - hero   : prompt pour générer l'image (generate-hero.mjs)
 *
 * Le slug est la clé d'index et DOIT matcher `Subject.slug` en DB.
 */

export interface SubjectDesign {
  /** Emoji court pour cartes/lists */
  emoji: string;
  /** Icône Lucide (server-safe) */
  iconName: string;
  /** Préfixe gradient (Tailwind arbitrary : 'from-X to-Y') — facultatif, déduit de color */
  gradient: string;
  /** Motif décoratif pointillé utilisé en filigrane */
  motif: 'dots' | 'grid' | 'waves' | 'sparkles' | 'circuit' | 'tree' | 'globe' | 'lines';
  /** Couleur d'accent HSL pour SVG inline */
  accentHsl: string;
}

export interface SubjectSeo {
  /** Title SEO FR (sans suffixe plateforme) */
  titleFr: string;
  /** Title SEO AR */
  titleAr: string;
  /** Description meta FR (~155 char) */
  descriptionFr: string;
  /** Description meta AR */
  descriptionAr: string;
  /** Mots-clés ciblés (FR) pour le SEO Tunisien */
  keywordsFr: string[];
  /** Mots-clés (AR) */
  keywordsAr: string[];
  /** Paires pour related subjects */
  related: string[];
  /** FAQ (3 questions/réponses) pour JSON-LD FAQPage */
  faq: { q: string; a: string }[];
  /** Description longue marketing (intro affichée sur la page) */
  introFr: string;
  introAr: string;
}

export interface SubjectHero {
  /** Prompt pour image_synthesize */
  prompt: string;
  /** Alt textuel pour SEO */
  altFr: string;
  /** Position de l'image dans la hero */
  position: 'right' | 'background' | 'inline';
  /** Style */
  style: 'flat' | '3d' | 'illustration' | 'photo';
}

export interface SubjectConfig {
  slug: string;
  /** DB override : couleur principale (hex) */
  color: string;
  design: SubjectDesign;
  seo: SubjectSeo;
  hero: SubjectHero;
}

const T = 'Tunisian educational context, official curriculum reference';

/** Génère un prompt d'illustration moderne pour le hero */
const hero = (
  subject: string,
  visual: string,
  detail: string,
  style: '3d' | 'flat' | 'isometric' | 'photo' = '3d',
  palette = 'soft pastel + retro modern',
): string =>
  `${style} illustration of ${subject}, ${visual}, ${detail}, ${palette}, ${T}, clean editorial style, soft lighting, minimalist, no text, no watermark, 1920x600 hero banner, PNG-ready composition`;

export const SUBJECTS_CONFIG: Record<string, SubjectConfig> = {
  mathematiques: {
    slug: 'mathematiques',
    color: '#0EA5E9',
    design: {
      emoji: '📐',
      iconName: 'Calculator',
      gradient: 'from-sky-100 via-sky-50 to-blue-50',
      motif: 'grid',
      accentHsl: '199 89% 48%',
    },
    seo: {
      titleFr: 'Mathématiques — Cours, Devoirs et Exercices gratuits',
      titleAr: 'الرياضيات — دروس، فروض، تمارين مجانية',
      descriptionFr:
        '📐 +8600 ressources gratuites en Mathématiques pour le système éducatif tunisien : cours, devoirs, séries, sujets bac et corrigés. 7ème → BAC.',
      descriptionAr:
        '📐 أكثر من 8600 مورد مجاني في الرياضيات لتلاميذ النظام التربوي التونسي: دروس، فروض، سلاسل، مواضيع باكالوريا مع التصحيح. من السنة السابعة إلى الباكالوريا.',
      keywordsFr: [
        'cours maths tunisie',
        'devoirs maths',
        'bac maths',
        'séries exercices maths',
        'programme officiel maths',
        '7ème 8ème 9ème maths',
        'tc bac',
      ],
      keywordsAr: [
        'دروس رياضيات تونس',
        'فروض رياضيات',
        'باكالوريا رياضيات',
        'تمارين رياضيات',
        'برنامج رسمي رياضيات',
      ],
      related: ['physique', 'svt', 'technologie', 'informatique'],
      faq: [
        {
          q: 'Quelles sont les matières en Mathématiques au BAC tunisien ?',
          a: 'Au BAC tunisien, les Mathématiques (7h/semaine en 4ème année) couvrent algèbre, analyse, géométrie, probabilités et statistiques. Trois sous-filières : Mathématiques (9h), Sc.expérimentales (3h) et Techniques (3h).',
        },
        {
          q: 'Où trouver des cours gratuits de Mathématiques en Tunisie ?',
          a: "Examanet centralise +8600 ressources gratuites en Mathématiques : cours, devoirs, séries d'exercices et corrigés, conformes au programme officiel du Ministère de l'Éducation tunisien (JORT 2019-1085).",
        },
        {
          q: 'Comment réussir en Mathématiques au lycée tunisien ?',
          a: "Pratiquez régulièrement avec les séries d'exercices par trimestre, maîtrisez les formules clés (dérivées, intégrales, suites) et entraînez-vous sur les sujets BAC des années précédentes avec leurs corrigés.",
        },
      ],
      introFr:
        "Des cours structurés, des devoirs par trimestre et des séries d'exercices couvrant tout le programme officiel — 7ème de base jusqu'au Baccalauréat. Conformes au JORT n° 2019-1085.",
      introAr:
        'دروس منظمة، فروض حسب الثلاثي، وسلاسل تمارين تغطي كامل البرنامج الرسمي — من السنة السابعة إلى الباكالوريا. مطابق للرائد الرسمي عدد 2019-1085.',
    },
    hero: {
      prompt: hero(
        'mathematics geometry formulas',
        'geometric shapes, mathematical symbols, fractal patterns, infinity symbol',
        'floating sacred geometry, golden ratio spirals, pi symbol, mathematical elegance',
        '3d',
        'sky blue + coral orange pastels',
      ),
      altFr: 'Illustration 3D de géométrie mathématique, fractales et symboles mathématiques',
      position: 'right',
      style: '3d',
    },
  },

  physique: {
    slug: 'physique',
    color: '#8B5CF6',
    design: {
      emoji: '⚛️',
      iconName: 'Atom',
      gradient: 'from-violet-100 via-violet-50 to-purple-50',
      motif: 'circuit',
      accentHsl: '262 83% 58%',
    },
    seo: {
      titleFr: 'Physique — Cours, Devoirs et Exercices gratuits',
      titleAr: 'الفيزياء — دروس، فروض، تمارين',
      descriptionFr:
        '⚛️ +3000 ressources en Physique pour le système éducatif tunisien : mécanique, électricité, optique, ondes. Cours, séries et corrigés du BAC.',
      descriptionAr:
        '⚛️ أكثر من 3000 مورد في الفيزياء: ميكانيكا، كهرباء، بصريات، موجات. دروس وسلاسل وتمارين للباكالوريا.',
      keywordsFr: [
        'cours physique tunisie',
        'bac physique',
        'mécanique',
        'électricité',
        'optique',
        'séries physique',
        'corrigés bac physique',
      ],
      keywordsAr: [
        'دروس فيزياء تونس',
        'باك فيزياء',
        'ميكانيكا',
        'كهرباء',
        'بصريات',
        'تصحيح باك فيزياء',
      ],
      related: ['mathematiques', 'svt', 'technologie'],
      faq: [
        {
          q: "Combien d'heures de Physique au BAC tunisien ?",
          a: "En 4ème année (BAC) : 4h/semaine en Mathématiques, 5h/semaine en Sciences expérimentales, 2.5h/semaine en Sciences techniques, 2h/semaine en Sciences de l'informatique.",
        },
        {
          q: 'Quels thèmes en Sciences physiques 4ème année Tunisie ?',
          a: "Programme officiel 4AS : Les interactions dans l'univers (mécanique, électricité, magnétisme), optique ondulatoire, chimie organique (alkylbenzènes, esters), durée totale 54-62h.",
        },
        {
          q: "Comment s'entraîner pour le BAC physique ?",
          a: "Sur Examanet : sujets BAC physique depuis 2010 + corrigés détaillés + séries d'exercices par trimestre pour chaque section.",
        },
      ],
      introFr:
        'Mécanique, électricité, optique, ondes et chimie — tous les thèmes du programme officiel tunisien. Pour les 4 sections BAC (Math, Sc.exp, Sc.tech, Sc.info).',
      introAr:
        'ميكانيكا، كهرباء، بصريات، موجات وكيمياء — كامل برنامج تونس الرسمي. للقسمات الأربعة للباكالوريا.',
    },
    hero: {
      prompt: hero(
        'physics and energy',
        'atoms, orbits, electromagnetic fields, quantum particles, electrical arcs',
        'glowing atoms, magnetic field lines, energy waves, plasma sphere',
        '3d',
        'violet + electric purple pastels',
      ),
      altFr: "Illustration 3D d'atomes, orbites et champs électromagnétiques",
      position: 'right',
      style: '3d',
    },
  },

  svt: {
    slug: 'svt',
    color: '#10B981',
    design: {
      emoji: '🌱',
      iconName: 'Leaf',
      gradient: 'from-emerald-100 via-green-50 to-teal-50',
      motif: 'tree',
      accentHsl: '160 84% 39%',
    },
    seo: {
      titleFr: 'Sciences de la Vie et de la Terre (SVT) — Cours et Exercices',
      titleAr: 'علوم الحياة والأرض — دروس وتمارين',
      descriptionFr:
        "🌱 SVT Tunisie : cours, devoirs, exercices et corrigés. De la 7ème de base jusqu'au BAC (Sc.expérimentales 5h/sem). Programme officiel JORT.",
      descriptionAr:
        '🌱 علوم الحياة والأرض في تونس: دروس، فروض، تمارين. من السنة السابعة إلى الباكالوريا (شعبة العلوم التجريبية 5أ/أ). برنامج رسمي.',
      keywordsFr: [
        'SVT tunisie',
        'biologie',
        'géologie',
        'écologie',
        'BAC SVT',
        'sciences naturelles',
      ],
      keywordsAr: ['علوم الحياة والأرض تونس', 'بيولوجيا', 'جيولوجيا', 'باك علوم تجريبية'],
      related: ['physique', 'mathematiques', 'philosophie'],
      faq: [
        {
          q: 'Quelles sont les branches de SVT au BAC tunisien ?',
          a: 'SVT est obligatoire en 1AS-2AS (1-2h/sem). Au BAC, principales en section Sciences expérimentales (5h/sem en 4ème année) et en complément pour Mathématiques, Sc.techniques, Sc.informatique.',
        },
        {
          q: 'Où trouver le programme officiel SVT Tunisie ?',
          a: 'Programme disponible sur edunet.tn/ressources/pedagogie/programmes/nouveaux_programme2011/secondaire/svt.pdf',
        },
      ],
      introFr:
        'Biologie cellulaire, génétique, écologie, géologie — du collège au BAC. SVT pour toutes les sections du lycée tunisien.',
      introAr: 'بيولوجيا الخلية، علم الوراثة، بيئة، جيولوجيا — من الكلية إلى الباكالوريا.',
    },
    hero: {
      prompt: hero(
        'biology and nature',
        'leaves, DNA helix, cells, ecosystem, biodiversity',
        'DNA double helix entwined with green leaves, plant cells, butterfly, terrarium',
        '3d',
        'emerald + sage green + cream pastels',
      ),
      altFr: "Illustration 3D d'ADN, feuilles et cellules",
      position: 'right',
      style: '3d',
    },
  },

  francais: {
    slug: 'francais',
    color: '#EF4444',
    design: {
      emoji: '📖',
      iconName: 'BookOpen',
      gradient: 'from-rose-100 via-red-50 to-pink-50',
      motif: 'lines',
      accentHsl: '0 84% 60%',
    },
    seo: {
      titleFr: 'Français — Cours, conjugaison, rédaction et BAC',
      titleAr: 'الفرنسية — دروس، قواعد، تعبير',
      descriptionFr:
        '📖 Français en Tunisie : cours de grammaire, conjugaison, rédaction, dissertations et commentaires. Préparation BAC toutes sections.',
      descriptionAr:
        '📖 الفرنسية في تونس: دروس القواعد والصرف والتعبير. تحضير الباكالوريا لجميع الأقسام.',
      keywordsFr: [
        'français tunisie',
        'grammaire française',
        'conjugaison',
        'rédaction',
        'dissertation',
        'commentaire',
        'BAC français',
      ],
      keywordsAr: ['الفرنسية تونس', 'قواعد الفرنسية', 'صرف', 'تعبير كتابي'],
      related: ['arabe', 'anglais', 'philosophie', 'histoire'],
      faq: [
        {
          q: "Comment s'organise le cours de Français au lycée tunisien ?",
          a: '3h/semaine de la 7ème à la terminale : étude de textes, grammaire, conjugaison, expression écrite (rédaction, dissertation, commentaire) et oral.',
        },
        {
          q: 'Quel niveau de français pour le BAC tunisien ?',
          a: 'Le BAC français évalue : compréhension de texte (12pts), grammaire et conjugaison (6pts), expression écrite (12pts) — dissertation ou commentaire.',
        },
      ],
      introFr:
        "La langue officielle d'enseignement en Tunisie — grammaire, conjugaison, rédaction, dissertation littéraire. Préparation complète du BAC.",
      introAr: 'لغة التعليم الرسمية في تونس — قواعد، صرف، تعبير، تحرير. تحضير شامل للباكالوريا.',
    },
    hero: {
      prompt: hero(
        'French literature and language',
        'open book, quill pen, Eiffel tower silhouette, poetry pages',
        'vintage book opening with floating letters, French flag hints, classical typography',
        'flat',
        'rose + cream + Bordeaux pastels',
      ),
      altFr: 'Illustration de livre ouvert et plume, lettres flottantes',
      position: 'right',
      style: 'flat',
    },
  },

  arabe: {
    slug: 'arabe',
    color: '#F59E0B',
    design: {
      emoji: '📜',
      iconName: 'BookText',
      gradient: 'from-amber-100 via-yellow-50 to-orange-50',
      motif: 'sparkles',
      accentHsl: '38 92% 50%',
    },
    seo: {
      titleFr: 'Arabe — Cours, conjugaison et BAC en Tunisie',
      titleAr: 'العربية — دروس قواعد، صرف وتعبير',
      descriptionFr:
        '📜 Arabe scolaire tunisien : grammaire (نحو), conjugaison (صرف), expression écrite (تعبير), commentaire littéraire (بلاغة). Toutes classes.',
      descriptionAr:
        '📜 العربية في تونس: نحو، صرف، تعبير، بلاغة. دروس لكل المستويات من السنة السابعة إلى الباكالوريا.',
      keywordsFr: [
        'arabe tunisie',
        'grammaire arabe',
        'conjugaison arabe',
        'BAC arabe',
        'تعبير',
        'بلاغة',
      ],
      keywordsAr: ['العربية تونس', 'النحو', 'الصرف', 'البلاغة', 'التعبير', 'باكالوريا عربية'],
      related: ['francais', 'philosophie', 'histoire', 'education-islamique'],
      faq: [
        {
          q: 'Quelles sections font Arabe renforcé au BAC tunisien ?',
          a: 'Arabe en BAC Lettres est renforcé (3h/sem), en BAC Sc.expérimentales et Sc.techniques 2h/sem, en BAC Math 2h/sem.',
        },
        {
          q: "Combien d'heures d'Arabe au lycée tunisien ?",
          a: 'De 7ème à 4ème année : 2-4h/sem. Programme couvre grammaire, conjugaison, expression écrite et patrimoine littéraire arabo-islamique.',
        },
      ],
      introFr:
        'اللغة العربية في تونس — نحو، صرف، تعبير كتابي، بلاغة. من السابعة أساسي إلى الباكالوريا، لجميع الأقسام.',
      introAr:
        'تدريس اللغة العربية في تونس يشمل النحو والصرف والتعبير والبلاغة وفق البرنامج الرسمي لوزارة التربية.',
    },
    hero: {
      prompt: hero(
        'Arabic language and calligraphy',
        'Arabic calligraphy, geometric islamic patterns, traditional arabesque, calligraphy pen',
        'flowing Arabic calligraphic strokes forming geometric arabesque, golden ink on parchment',
        'flat',
        'amber + gold + cream warm pastels',
      ),
      altFr: 'Illustration de calligraphie arabe et motifs géométriques islamiques',
      position: 'right',
      style: 'flat',
    },
  },

  anglais: {
    slug: 'anglais',
    color: '#3B82F6',
    design: {
      emoji: '🌍',
      iconName: 'Globe2',
      gradient: 'from-blue-100 via-blue-50 to-sky-50',
      motif: 'globe',
      accentHsl: '217 91% 60%',
    },
    seo: {
      titleFr: 'Anglais — Cours, vocabulaire, grammaire et BAC',
      titleAr: 'الإنجليزية — دروس وقواعد',
      descriptionFr:
        '🌍 Anglais scolaire tunisien : grammar, vocabulary, comprehension, written expression. Cours et exercices par niveau.',
      descriptionAr:
        '🌍 الإنجليزية في تونس: قواعد، مفردات، فهم وتعبير. دروس وتمارين لكل المستويات.',
      keywordsFr: [
        'anglais tunisie',
        'english grammar',
        'BAC anglais',
        'comprehension écrite',
        'vocabulary',
      ],
      keywordsAr: ['الإنجليزية تونس', 'قواعد إنجليزية', 'باكالوريا إنجليزية'],
      related: ['francais', 'allemand', 'espagnol'],
      faq: [
        {
          q: "Combien d'heures d'Anglais au lycée tunisien ?",
          a: '2-3h/sem de la 7ème au BAC. Renforcé en section Lettres et Sc.informatique, régulier en Math/Sc.exp/Éco.',
        },
      ],
      introFr:
        'English as global language — grammar, vocabulary, comprehension, essays. All levels from middle school to BAC.',
      introAr: 'لغة عالمية — قواعد ومفردات وفهم وتعبير كتابي. جميع المستويات.',
    },
    hero: {
      prompt: hero(
        'English language learning',
        'British flag hints, books, globe, retro typewriter',
        'steam from teacup, vintage typewriter, stacked leather books, British flag motif',
        'flat',
        'navy blue + cream + red pastels',
      ),
      altFr: "Illustration vintage d'une machine à écrire, livres et drapeau britannique",
      position: 'right',
      style: 'flat',
    },
  },

  histoire: {
    slug: 'histoire',
    color: '#A16207',
    design: {
      emoji: '🏛️',
      iconName: 'History',
      gradient: 'from-yellow-100 via-amber-50 to-orange-50',
      motif: 'tree',
      accentHsl: '36 64% 32%',
    },
    seo: {
      titleFr: 'Histoire — Cours, Histoire de Tunisie et BAC',
      titleAr: 'التاريخ — دروس تاريخ تونس والعالم',
      descriptionFr:
        '🏛️ Histoire en Tunisie : Antiquité, Carthage, période islamique, colonisation, indépendantisme, Tunisie contemporaine. Fiches et BAC.',
      descriptionAr:
        '🏛️ التاريخ في تونس: القديم، قرطاج، الفترة الإسلامية، الاستعمار، الاستقلال، تونس المعاصرة.',
      keywordsFr: [
        'histoire tunisie',
        'histoire BAC tunisien',
        'Carthage',
        'bourguiba',
        'histoire mondiale',
      ],
      keywordsAr: ['تاريخ تونس', 'تاريخ باكالوريا', 'قرطاج', 'بورقيبة'],
      related: ['geographie', 'philosophie', 'arabe', 'francais'],
      faq: [],
      introFr:
        'De Carthage à la Tunisie indépendante — histoire universelle et nationale couverte en programmes officiels.',
      introAr: 'من قرطاج إلى تونس المستقلة.',
    },
    hero: {
      prompt: hero(
        'history and archaeology',
        'Carthaginian ruins, ancient columns, scrolls, amphitheater',
        'Carthage ruins silhouette, scroll with map, ancient column, mosaic pattern',
        '3d',
        'amber + sand + ancient stone pastels',
      ),
      altFr: 'Illustration 3D de ruines de Carthage et parchemin ancien',
      position: 'right',
      style: '3d',
    },
  },

  geographie: {
    slug: 'geographie',
    color: '#059669',
    design: {
      emoji: '🗺️',
      iconName: 'Globe2',
      gradient: 'from-emerald-100 via-green-50 to-teal-50',
      motif: 'globe',
      accentHsl: '160 84% 35%',
    },
    seo: {
      titleFr: 'Géographie — Cours, cartes, Tunisie et monde',
      titleAr: 'الجغرافيا — دروس تونس والعالم',
      descriptionFr:
        '🗺️ Géographie scolaire : Tunisie (relief, climat, économie), Maghreb, monde. Fiches BAC, croquis cartographiques.',
      descriptionAr: '🗺️ الجغرافيا: تونس، المغرب العربي، العالم. خرائط وفقس منهجية.',
      keywordsFr: ['géographie tunisie', 'croquis cartographiques', 'BAC géographie'],
      keywordsAr: ['جغرافيا تونس', 'خرائط', 'باكالوريا جغرافيا'],
      related: ['histoire', 'philosophie', 'svt'],
      faq: [],
      introFr:
        'Cartes, croquis et fiches — géographie physique, humaine et économique de la Tunisie et du monde.',
      introAr: 'خرائط وفقس منهجية.',
    },
    hero: {
      prompt: hero(
        'geography and maps',
        'compass, world map, topographic relief, vintage atlas',
        'floating 3D topographic map, compass rose, parchment atlas, mountain relief',
        '3d',
        'emerald + cream + sand pastels',
      ),
      altFr: 'Illustration 3D de cartes topographiques et boussole vintage',
      position: 'background',
      style: '3d',
    },
  },

  philosophie: {
    slug: 'philosophie',
    color: '#7C3AED',
    design: {
      emoji: '💭',
      iconName: 'Brain',
      gradient: 'from-purple-100 via-violet-50 to-indigo-50',
      motif: 'sparkles',
      accentHsl: '262 83% 58%',
    },
    seo: {
      titleFr: 'Philosophie — Cours, dissertations BAC',
      titleAr: 'الفلسفة — دروس ومقالات',
      descriptionFr:
        '💭 Philosophie tunisienne : conscience, raison, vérité, liberté, bonheur. Dissertations BAC et commentaires de texte.',
      descriptionAr: '💭 الفلسفة في تونس: الوعي، العقل، الحقيقة، الحرية، السعادة.',
      keywordsFr: [
        'philosophie tunisie',
        'dissertation philosophie',
        'BAC philo',
        'conscience raison',
      ],
      keywordsAr: ['فلسفة تونس', 'مقالة فلسفية', 'باك فلسفة'],
      related: ['francais', 'arabe', 'histoire', 'sociologie'],
      faq: [],
      introFr:
        'Antiquité, modernité, thématiques tunisiennes — méthodologie de la dissertation et du commentaire BAC.',
      introAr: 'قديم، حديث، مواضيع تونسية.',
    },
    hero: {
      prompt: hero(
        'philosophy and thinking',
        'ancient Greek bust, owl of Athena, open philosophy book, classical columns',
        'floating Plato bust, thought bubble with question marks, olive branch, classical scroll',
        '3d',
        'purple + cream + olive pastels',
      ),
      altFr: 'Illustration 3D de buste de Platon et livres philosophiques',
      position: 'background',
      style: '3d',
    },
  },

  economie: {
    slug: 'economie',
    color: '#DC2626',
    design: {
      emoji: '📈',
      iconName: 'TrendingUp',
      gradient: 'from-red-100 via-rose-50 to-orange-50',
      motif: 'lines',
      accentHsl: '0 73% 50%',
    },
    seo: {
      titleFr: 'Économie — Économie et services, BAC Éco-Gestion',
      titleAr: 'الاقتصاد — باكالوريا اقتصاد وتصرف',
      descriptionFr:
        '📈 Économie en Tunisie : microéconomie, macroéconomie, économie tunisienne. Cours 4AS section Économie-Gestion.',
      descriptionAr: '📈 الاقتصاد في تونس: الاقتصاد الجزئي والكلي والاقتصاد التونسي.',
      keywordsFr: ['économie tunisie', 'BAC éco-gestion', 'microéconomie', 'macroéconomie'],
      keywordsAr: ['اقتصاد تونس', 'باكالوريا اقتصاد', 'الاقتصاد الجزئي'],
      related: ['gestion', 'mathematiques', 'philosophie'],
      faq: [],
      introFr:
        "De l'offre-demande à la politique économique tunisienne — cours, exercices et sujets BAC.",
      introAr: 'من العرض والطلب إلى السياسة الاقتصادية.',
    },
    hero: {
      prompt: hero(
        'economics and finance',
        'stock market chart, coins, calculator, financial graph',
        'rising 3D bar chart, golden coins, classical Greek column, scroll of wealth',
        '3d',
        'red + cream + gold pastels',
      ),
      altFr: 'Illustration 3D de graphiques économiques et pièces en or',
      position: 'right',
      style: '3d',
    },
  },

  gestion: {
    slug: 'gestion',
    color: '#0891B2',
    design: {
      emoji: '💼',
      iconName: 'Briefcase',
      gradient: 'from-cyan-100 via-sky-50 to-blue-50',
      motif: 'lines',
      accentHsl: '190 95% 43%',
    },
    seo: {
      titleFr: 'Gestion — Comptabilité, finance BAC Éco-Gestion',
      titleAr: 'التصرف — محاسبة، باكالوريا',
      descriptionFr:
        "💼 Gestion en Tunisie : comptabilité, finance d'entreprise, contrôle de gestion. 4AS section Économie-Gestion.",
      descriptionAr: '💼 التصرف في تونس: محاسبة، مالية المؤسسة.',
      keywordsFr: ['gestion tunisie', 'comptabilité', 'BAC éco-gestion'],
      keywordsAr: ['تصرف تونس', 'محاسبة', 'باكالوريا تصرف'],
      related: ['economie', 'mathematiques'],
      faq: [],
      introFr:
        'Comptabilité générale, analytique, finance — exercices corrigés et méthodologie BAC.',
      introAr: 'محاسبة عامة، تحليلية، مالية.',
    },
    hero: {
      prompt: hero(
        'business management',
        'ledger book, calculator, document folder, gavel, business handshake',
        '3D stacked accounting ledger books, calculator, financial spreadsheet sheet, classical column',
        '3d',
        'teal + cream + metallic pastels',
      ),
      altFr: 'Illustration 3D de livres de comptabilité et calculatrice',
      position: 'right',
      style: '3d',
    },
  },

  informatique: {
    slug: 'informatique',
    color: '#1E40AF',
    design: {
      emoji: '💻',
      iconName: 'Cpu',
      gradient: 'from-blue-100 via-indigo-50 to-violet-50',
      motif: 'circuit',
      accentHsl: '224 76% 40%',
    },
    seo: {
      titleFr: 'Informatique — Algorithmique, programmation, BAC',
      titleAr: 'الإعلامية — خوارزميات، برمجة',
      descriptionFr:
        '💻 Informatique scolaire Tunisie : algorithmique, bureautique, sécurité. Sections TI 2AS, Sc.info BAC.',
      descriptionAr: '💻 الإعلامية في تونس: خوارزميات، برمجة، إعلامية تطبيقية.',
      keywordsFr: [
        'informatique tunisie',
        'algorithmique',
        'programmation',
        'BAC sciences informatique',
        'TI 2AS',
      ],
      keywordsAr: [
        'إعلامية تونس',
        'خوارزميات',
        'برمجة',
        'باكالوريا إعلامية',
        'تكنولوجيا الإعلامية',
      ],
      related: ['technologie', 'mathematiques', 'tic', 'algo-prog'],
      faq: [
        {
          q: "Quelle est la section Sciences de l'Informatique au BAC tunisien ?",
          a: 'La section Sc.Informatique du BAC tunisien a 32h/semaine en 3ème année et 31h/sem en 4ème année. Matières : Math, Sc.physiques, Algo/Prog, TIC, Bases de données (4AS) / Réseaux (3AS).',
        },
        {
          q: "Qu'est-ce que la TI en 2ème année ?",
          a: "Technologies de l'Informatique (TI) est une section de 2ème année qui devient Sciences de l'Informatique au BAC. Informatique intégrée à 5h/semaine.",
        },
      ],
      introFr:
        "De l'algorithmique à la programmation — Informatique en Tunisie, parcours TI → Sc.info BAC.",
      introAr: 'من الخوارزميات إلى البرمجة.',
    },
    hero: {
      prompt: hero(
        'computer science and code',
        'laptop with code, motherboard chips, circuit board, AI neural network',
        'floating 3D code editor window, microchip details, circuit board pattern, holographic keyboard',
        '3d',
        'deep blue + electric purple + neon green pastels',
      ),
      altFr: 'Illustration 3D de laptop avec code et carte mère',
      position: 'right',
      style: '3d',
    },
  },

  technologie: {
    slug: 'technologie',
    color: '#475569',
    design: {
      emoji: '⚙️',
      iconName: 'Wrench',
      gradient: 'from-slate-100 via-gray-50 to-zinc-50',
      motif: 'circuit',
      accentHsl: '215 16% 47%',
    },
    seo: {
      titleFr: 'Technologie — Génie mécanique et électrique, BAC',
      titleAr: 'التكنولوجيا — هندسة ميكانيكية وكهربائية',
      descriptionFr:
        '⚙️ Technologie scolaire : mécanique, électricité, électronique, projets techniques. Collèges 8-9ème et BAC Sc.techniques.',
      descriptionAr: '⚙️ التكنولوجيا: ميكانيكا، كهرباء، إلكترونيات.',
      keywordsFr: [
        'technologie tunisie',
        'génie mécanique',
        'génie électrique',
        'BAC sciences techniques',
      ],
      keywordsAr: ['تكنولوجيا تونس', 'هندسة ميكانيكية', 'هندسة كهربائية'],
      related: ['informatique', 'physique', 'mathematiques'],
      faq: [],
      introFr:
        'Mécanique, électricité, électronique — cours, projets techniques pour collège et BAC Sc.techniques.',
      introAr: 'ميكانيكا، كهرباء، إلكترونيات.',
    },
    hero: {
      prompt: hero(
        'technology and engineering',
        'gears, robotic arm, blueprint drawings, mechanical tools',
        'floating 3D mechanical gears, blueprint technical drawing, robotic claw, circuit board',
        '3d',
        'slate + steel + amber pastels',
      ),
      altFr: "Illustration 3D d'engrenages et bras robotique",
      position: 'right',
      style: '3d',
    },
  },

  sport: {
    slug: 'sport',
    color: '#EA580C',
    design: {
      emoji: '⚽',
      iconName: 'Trophy',
      gradient: 'from-orange-100 via-red-50 to-amber-50',
      motif: 'sparkles',
      accentHsl: '21 90% 50%',
    },
    seo: {
      titleFr: 'Éducation Physique & Sport — Section sport BAC Tunisie',
      titleAr: 'الرياضة — تربية بدنية',
      descriptionFr:
        "⚽ EPS tunisien : section Sport au BAC (6h/sem entraînement). Activités sportives, méthodologie d'entraînement.",
      descriptionAr: '⚽ التربية البدنية في تونس: قسم الرياضة في الباكالوريا.',
      keywordsFr: ['sport tunisie', 'éducation physique', 'EPS', 'section sport BAC'],
      keywordsAr: ['رياضة تونس', 'تربية بدنية', 'باكالوريا رياضة'],
      related: ['svt', 'physique'],
      faq: [],
      introFr:
        'Section sport au BAC tunisien avec entraînement 6h/semaine. EPS pour toutes les classes.',
      introAr: 'قسم الرياضة في الباكالوريا.',
    },
    hero: {
      prompt: hero(
        'sports and athletics',
        'sports ball, running shoes, Olympic torch, athletic track',
        'floating 3D sports balls, dynamic running shoes, olympic flame, stadium spotlight',
        '3d',
        'orange + amber + dynamic energy pastels',
      ),
      altFr: 'Illustration 3D de ballons de sport et chaussures de course',
      position: 'background',
      style: '3d',
    },
  },

  musique: {
    slug: 'musique',
    color: '#9333EA',
    design: {
      emoji: '🎵',
      iconName: 'Music',
      gradient: 'from-purple-100 via-violet-50 to-pink-50',
      motif: 'waves',
      accentHsl: '280 100% 50%',
    },
    seo: {
      titleFr: 'Musique — Éducation musicale, optionnelle 3-4AS',
      titleAr: 'الموسيقى — تربية موسيقية',
      descriptionFr:
        '🎵 Éducation musicale en Tunisie : solfège, théorie, histoire de la musique. Matière optionnelle 3-4AS.',
      descriptionAr: '🎵 التربية الموسيقية في تونس: سولفيج ونظرية.',
      keywordsFr: ['musique tunisie', 'éducation musicale', 'solfège'],
      keywordsAr: ['موسيقى تونس', 'تربية موسيقية'],
      related: ['education-artistique', 'histoire'],
      faq: [],
      introFr: 'Solfège, théorie, histoire — éducation musicale pour tous les niveaux.',
      introAr: 'سولفيج ونظرية وتاريخ.',
    },
    hero: {
      prompt: hero(
        'music and sound waves',
        'musical notes, piano keys, sound waves, vinyl record',
        'floating 3D musical notes, classic piano keys, vinyl record, sound waves visualization',
        '3d',
        'purple + magenta + cream pastels',
      ),
      altFr: 'Illustration 3D de notes de musique et piano',
      position: 'right',
      style: '3d',
    },
  },

  'algo-prog': {
    slug: 'algo-prog',
    color: '#8B5CF6',
    design: {
      emoji: '💡',
      iconName: 'Code2',
      gradient: 'from-violet-100 via-purple-50 to-fuchsia-50',
      motif: 'circuit',
      accentHsl: '262 83% 58%',
    },
    seo: {
      titleFr: 'Algorithmique & Programmation — BAC Sc.Informatique Tunisie',
      titleAr: 'الخوارزميات والبرمجة — باكالوريا',
      descriptionFr:
        '💡 Algorithmique BAC Sc.Info Tunisie : algorigrammes, Pascal/Python, structures de données, récursivité.',
      descriptionAr: '💡 الخوارزميات في باكالوريا إعلامية: مخططات، باسكال/بايثون.',
      keywordsFr: [
        'algorithmique',
        'programmation',
        'BAC sciences informatique',
        'algorigrammes',
        'Python',
        'Pascal',
      ],
      keywordsAr: ['خوارزميات', 'برمجة', 'باكالوريا إعلامية'],
      related: ['informatique', 'tic', 'mathematiques'],
      faq: [],
      introFr:
        'Langage Pascal/Python, structures de données, récursivité — tout le programme officiel.',
      introAr: 'باسكال/بايثون.',
    },
    hero: {
      prompt: hero(
        'algorithm and code',
        'flowchart boxes connected, code brackets, glowing syntax',
        'floating 3D algorithm flowchart boxes, glowing code snippets, brackets and operators',
        '3d',
        'violet + indigo + neon glow pastels',
      ),
      altFr: "Illustration 3D d'organigrammes algorithmiques et snippets de code",
      position: 'right',
      style: '3d',
    },
  },

  tic: {
    slug: 'tic',
    color: '#0EA5E9',
    design: {
      emoji: '📡',
      iconName: 'Network',
      gradient: 'from-sky-100 via-cyan-50 to-blue-50',
      motif: 'globe',
      accentHsl: '199 89% 48%',
    },
    seo: {
      titleFr: "TIC — Technologies de l'Information et Communication",
      titleAr: 'تكنولوجيا الإعلام والاتصال',
      descriptionFr:
        '📡 TIC scolaire Tunisie : Web 2.0, réseaux sociaux, cyber-sécurité, bureautique. BAC Sc.informatique.',
      descriptionAr: '📡 تكنولوجيا الإعلام والاتصال في تونس.',
      keywordsFr: ['TIC tunisie', 'technologies information', 'web 2.0', 'cybersécurité'],
      keywordsAr: ['تكنولوجيا الإعلام تونس', 'الأمن السيبراني'],
      related: ['informatique', 'algo-prog', 'bases-donnees'],
      faq: [],
      introFr: 'TIC 1.5h/sem en 3AS et 4AS Sc.informatique — usage et culture numérique.',
      introAr: '1.5 أ/أ في 3 و 4 إعلامية.',
    },
    hero: {
      prompt: hero(
        'ICT and networks',
        'wifi waves, cloud servers, mobile devices, network nodes',
        'floating 3D cloud servers, wifi signals, mobile phones with screens, network nodes connecting',
        '3d',
        'sky blue + teal + white pastels',
      ),
      altFr: 'Illustration 3D de serveurs cloud et signaux wifi',
      position: 'background',
      style: '3d',
    },
  },

  'systeme-exploitation-reseaux': {
    slug: 'systeme-exploitation-reseaux',
    color: '#1E40AF',
    design: {
      emoji: '🖥️',
      iconName: 'Server',
      gradient: 'from-blue-100 via-indigo-50 to-slate-50',
      motif: 'circuit',
      accentHsl: '224 76% 40%',
    },
    seo: {
      titleFr: "Système d'exploitation et Réseaux — BAC Sc.Informatique",
      titleAr: 'نظام التشغيل والشبكات',
      descriptionFr:
        "🖥️ Systèmes d'exploitation, réseaux informatiques au BAC Sc.info 3AS : protocoles, adressage, routage.",
      descriptionAr: '🖥️ نظام التشغيل والشبكات في باكالوريا إعلامية.',
      keywordsFr: ['réseaux informatiques', 'système exploitation', 'BAC sc.info'],
      keywordsAr: ['شبكات', 'نظام تشغيل', 'باكالوريا إعلامية'],
      related: ['informatique', 'tic', 'algo-prog'],
      faq: [],
      introFr: 'OS, réseau, routage, adressage IP — programme 3AS Sc.info.',
      introAr: 'OS، شبكة، توجيه.',
    },
    hero: {
      prompt: hero(
        'operating systems and networking',
        'server racks, network cables, OS interface, terminal commands',
        '3D server stack with glowing LEDs, ethernet cables, abstract OS window, terminal code',
        '3d',
        'navy blue + steel + electric pastels',
      ),
      altFr: 'Illustration 3D de racks de serveurs et câbles réseau',
      position: 'background',
      style: '3d',
    },
  },

  'bases-donnees': {
    slug: 'bases-donnees',
    color: '#7C3AED',
    design: {
      emoji: '🗄️',
      iconName: 'Database',
      gradient: 'from-violet-100 via-purple-50 to-indigo-50',
      motif: 'lines',
      accentHsl: '262 83% 58%',
    },
    seo: {
      titleFr: 'Bases de données — Modélisation, SQL, BAC Sc.Info',
      titleAr: 'قواعد البيانات — نمذجة، SQL',
      descriptionFr:
        '🗄️ Bases de données BAC Sc.Info Tunisie : modèle relationnel, SQL, Merise. Cours 4AS.',
      descriptionAr: '🗄️ قواعد البيانات في باكالوريا إعلامية.',
      keywordsFr: ['bases données', 'SQL', 'Merise', 'BAC sciences informatique'],
      keywordsAr: ['قواعد البيانات', 'SQL'],
      related: ['informatique', 'algo-prog', 'tic'],
      faq: [],
      introFr: 'Merise, modèle relationnel, SQL — 4AS Sc.info.',
      introAr: 'Merise، نموذج علائقي.',
    },
    hero: {
      prompt: hero(
        'database management',
        'database tables, SQL query, server stack, data flow',
        '3D database cylinder icon, table grids, SQL query lines flowing, data warehouse',
        '3d',
        'violet + indigo + mint pastels',
      ),
      altFr: 'Illustration 3D de cylindre de base de données et lignes SQL',
      position: 'right',
      style: '3d',
    },
  },

  'sciences-informatique-matiere': {
    slug: 'sciences-informatique-matiere',
    color: '#2563EB',
    design: {
      emoji: '🖥️',
      iconName: 'Cpu',
      gradient: 'from-blue-50 via-indigo-50 to-violet-50',
      motif: 'circuit',
      accentHsl: '217 91% 60%',
    },
    seo: {
      titleFr: "Sciences de l'informatique (matière)",
      titleAr: 'علوم الإعلامية (مادة)',
      descriptionFr: "Matière Sciences de l'informatique — programme officiel tunisien.",
      descriptionAr: 'مادة علوم الإعلامية — البرنامج الرسمي.',
      keywordsFr: ['sciences informatique', 'matière', 'programme tunisien'],
      keywordsAr: ['علوم الإعلامية', 'مادة'],
      related: ['informatique', 'algo-prog'],
      faq: [],
      introFr: "Matière académique — Sciences de l'informatique.",
      introAr: 'مادة أكاديمية — علوم الإعلامية.',
    },
    hero: {
      prompt: hero(
        'computer science',
        'motherboard, circuit pattern, code brackets',
        'floating motherboard with chips, abstract circuit pattern',
        '3d',
        'blue + indigo pastels',
      ),
      altFr: 'Illustration de carte mère et composants',
      position: 'right',
      style: '3d',
    },
  },

  'education-civique': {
    slug: 'education-civique',
    color: '#DC2626',
    design: {
      emoji: '⚖️',
      iconName: 'GraduationCap',
      gradient: 'from-rose-100 via-red-50 to-amber-50',
      motif: 'sparkles',
      accentHsl: '0 73% 50%',
    },
    seo: {
      titleFr: 'Éducation civique — Citoyenneté, droits humains',
      titleAr: 'التربية المدنية — مواطنة، حقوق',
      descriptionFr:
        '⚖️ Éducation civique en Tunisie : citoyenneté, droits humains, institutions, valeurs républicaines.',
      descriptionAr: '⚖️ التربية المدنية: مواطنة، حقوق الإنسان.',
      keywordsFr: ['éducation civique tunisie', 'citoyenneté', 'droits humains'],
      keywordsAr: ['تربية مدنية تونس', 'مواطنة'],
      related: ['philosophie', 'histoire', 'education-islamique'],
      faq: [],
      introFr: 'Citoyenneté, droits humains, institutions — programme officiel.',
      introAr: 'مواطنة، حقوق الإنسان.',
    },
    hero: {
      prompt: hero(
        'civic education and citizenship',
        'parliament building, scales of justice, vote ballot, citizens',
        'classical courthouse with columns, justice scales, voting ballot, map of Tunisia',
        '3d',
        'red + cream + sand pastels',
      ),
      altFr: 'Illustration 3D de bâtiment institutionnel et balance de justice',
      position: 'background',
      style: '3d',
    },
  },

  'education-islamique': {
    slug: 'education-islamique',
    color: '#059669',
    design: {
      emoji: '☪️',
      iconName: 'Sparkles',
      gradient: 'from-emerald-100 via-green-50 to-teal-50',
      motif: 'sparkles',
      accentHsl: '160 84% 35%',
    },
    seo: {
      titleFr: 'Éducation islamique — Coran, Fiqh, Sira',
      titleAr: 'التربية الإسلامية — قرآن، فقه، سيرة',
      descriptionFr:
        '☪️ Éducation islamique Tunisie : Coran, jurisprudence, Sira du Prophète, valeurs islamiques.',
      descriptionAr: '☪️ التربية الإسلامية: قرآن، فقه، سيرة.',
      keywordsFr: ['éducation islamique tunisie', 'Coran', 'Fiqh', 'sira'],
      keywordsAr: ['تربية إسلامية تونس', 'قرآن', 'فقه', 'سيرة'],
      related: ['philosophie', 'arabe', 'pensee-islamique'],
      faq: [],
      introFr: 'Coran, Fiqh, Sira, valeurs — programme officiel 1h/sem.',
      introAr: 'قرآن، فقه، سيرة.',
    },
    hero: {
      prompt: hero(
        'Islamic education',
        'mosque architecture, Quran book, geometric patterns, crescent moon',
        '3D mosque silhouette with minaret, open Quran with golden pages, Islamic geometric arabesque, crescent moon',
        '3d',
        'emerald + gold + cream pastels',
      ),
      altFr: 'Illustration 3D de mosquée et Coran avec motifs géométriques',
      position: 'background',
      style: '3d',
    },
  },

  'pensee-islamique': {
    slug: 'pensee-islamique',
    color: '#10B981',
    design: {
      emoji: '🌙',
      iconName: 'Sparkles',
      gradient: 'from-teal-100 via-emerald-50 to-green-50',
      motif: 'sparkles',
      accentHsl: '160 84% 39%',
    },
    seo: {
      titleFr: 'Pensée islamique — Étude philosophique',
      titleAr: 'الفكر الإسلامي',
      descriptionFr: 'Pensée islamique en Tunisie — étude avancée.',
      descriptionAr: 'الفكر الإسلامي في تونس.',
      keywordsFr: ['pensée islamique', 'philosophie islamique'],
      keywordsAr: ['فكر إسلامي'],
      related: ['philosophie', 'education-islamique', 'arabe'],
      faq: [],
      introFr: 'Pensée et culture islamique.',
      introAr: 'الفكر الإسلامي.',
    },
    hero: {
      prompt: hero(
        'Islamic thought and philosophy',
        'ancient manuscripts, mosque lamp, geometric star patterns',
        'floating antique Islamic manuscript, ornate mosque lamp, geometric star pattern',
        'flat',
        'teal + gold + cream pastels',
      ),
      altFr: 'Illustration de manuscrit islamique ancien et lampe de mosquée',
      position: 'background',
      style: 'flat',
    },
  },

  '3eme-langue': {
    slug: '3eme-langue',
    color: '#F59E0B',
    design: {
      emoji: '🗣️',
      iconName: 'MessageSquare',
      gradient: 'from-amber-100 via-yellow-50 to-orange-50',
      motif: 'globe',
      accentHsl: '38 92% 50%',
    },
    seo: {
      titleFr: '3ème langue étrangère — Allemand, Espagnol, Italien',
      titleAr: 'اللغة الثالثة — ألماني، إسباني، إيطالي',
      descriptionFr:
        '🗣️ 3ème langue étrangère en Tunisie : allemand, espagnol, italien. Matière optionnelle 3-4AS.',
      descriptionAr: '🗣️ اللغة الثالثة في تونس: ألماني، إسباني، إيطالي.',
      keywordsFr: ['3ème langue', 'allemand tunisie', 'espagnol tunisie', 'italien tunisie'],
      keywordsAr: ['اللغة الثالثة', 'ألماني تونس', 'إسباني تونس'],
      related: ['anglais', 'francais', 'arabe'],
      faq: [],
      introFr: 'Allemand, espagnol ou italien — cours et exercices par niveau.',
      introAr: 'ألماني أو إسباني أو إيطالي.',
    },
    hero: {
      prompt: hero(
        'third foreign language',
        'speech bubbles in multiple languages, world flags pattern, open translation book',
        'speech bubbles with German/Spanish/Italian letters, world flags collection, multilingual dictionary',
        'flat',
        'amber + cream + multicolor pastels',
      ),
      altFr: 'Illustration de bulles de dialogue multilingues et drapeaux',
      position: 'right',
      style: 'flat',
    },
  },

  'education-artistique': {
    slug: 'education-artistique',
    color: '#EC4899',
    design: {
      emoji: '🎨',
      iconName: 'Palette',
      gradient: 'from-pink-100 via-rose-50 to-fuchsia-50',
      motif: 'sparkles',
      accentHsl: '330 81% 60%',
    },
    seo: {
      titleFr: 'Éducation artistique — Arts plastiques Tunisie',
      titleAr: 'التربية الفنية — الفنون التشكيلية',
      descriptionFr:
        '🎨 Éducation artistique en Tunisie : dessin, peinture, arts plastiques. Programme optionnelle.',
      descriptionAr: '🎨 التربية الفنية: رسم، ألوان.',
      keywordsFr: ['éducation artistique tunisie', 'arts plastiques', 'dessin'],
      keywordsAr: ['تربية فنية تونس', 'فنون تشكيلية'],
      related: ['musique', 'histoire'],
      faq: [],
      introFr: 'Arts plastiques, dessin, couleurs — expression créative.',
      introAr: 'فنون تشكيلية، رسم.',
    },
    hero: {
      prompt: hero(
        'arts and painting',
        'paint palette, brushes, canvas, vibrant colors',
        'floating 3D paint brushes, vibrant color splashes, canvas with abstract strokes, palette',
        '3d',
        'pink + magenta + multicolor pastels',
      ),
      altFr: 'Illustration 3D de palette de peintre et pinceaux',
      position: 'right',
      style: '3d',
    },
  },

  'histoire-geographie': {
    slug: 'histoire-geographie',
    color: '#6366F1',
    design: {
      emoji: '📚',
      iconName: 'BookText',
      gradient: 'from-indigo-100 via-blue-50 to-violet-50',
      motif: 'tree',
      accentHsl: '239 84% 67%',
    },
    seo: {
      titleFr: 'Histoire-Géographie — Matière intégrée Tunisie',
      titleAr: 'التاريخ والجغرافيا — مادة مدموجة',
      descriptionFr:
        '📚 Histoire-Géographie matière intégrée : cours, cartes, frises chronologiques.',
      descriptionAr: '📚 التاريخ والجغرافيا: دروس وخرائط.',
      keywordsFr: ['histoire géographie tunisie', 'matière intégrée'],
      keywordsAr: ['تاريخ وجغرافيا تونس'],
      related: ['histoire', 'geographie'],
      faq: [],
      introFr: 'Histoire et géographie combinées pour tous niveaux.',
      introAr: 'تاريخ وجغرافيا مدموجين.',
    },
    hero: {
      prompt: hero(
        'history and geography combined',
        'open atlas, scroll, compass, calendar',
        'overlapping atlas and history book, vintage compass, calendar overlay, telescope',
        'flat',
        'indigo + cream + earth tones',
      ),
      altFr: "Illustration de livre d'histoire ouvert et atlas de géographie",
      position: 'background',
      style: 'flat',
    },
  },

  theatre: {
    slug: 'theatre',
    color: '#F97316',
    design: {
      emoji: '🎭',
      iconName: 'Sparkles',
      gradient: 'from-orange-100 via-amber-50 to-red-50',
      motif: 'sparkles',
      accentHsl: '25 95% 53%',
    },
    seo: {
      titleFr: 'Théâtre — Art dramatique en Tunisie',
      titleAr: 'المسرح — فنون درامية',
      descriptionFr: '🎭 Cours et ressources théâtre.',
      descriptionAr: '🎭 دروس المسرح.',
      keywordsFr: ['théâtre tunisie', 'art dramatique'],
      keywordsAr: ['مسرح تونس'],
      related: ['education-artistique', 'francais', 'arabe'],
      faq: [],
      introFr: 'Art dramatique et théâtre scolaire.',
      introAr: 'فنون درامية.',
    },
    hero: {
      prompt: hero(
        'theater and dramatic arts',
        'theater masks, comedy tragedy, stage curtain',
        'comedy and tragedy masks, red stage curtain, spotlight, theatrical performance',
        '3d',
        'orange + red + gold pastels',
      ),
      altFr: 'Illustration 3D de masques de théâtre Comédie et Tragédie',
      position: 'right',
      style: '3d',
    },
  },
};

/** Helper : get config par slug, fallback safe */
export function getSubjectConfig(slug: string): SubjectConfig | null {
  return SUBJECTS_CONFIG[slug] || null;
}

/** Helper : couleurs pour le design system */
export const SUBJECT_COLORS: Record<string, string> = Object.fromEntries(
  Object.entries(SUBJECTS_CONFIG).map(([k, v]) => [k, v.color]),
);

/** Mapping icône Lucide client-safe */
export { SUBJECT_ICONS } from './subjects.icons';
