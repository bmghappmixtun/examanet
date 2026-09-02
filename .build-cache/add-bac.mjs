import fs from 'fs';
const fr = JSON.parse(fs.readFileSync('./src/messages/fr.json', 'utf8'));
const ar = JSON.parse(fs.readFileSync('./src/messages/ar.json', 'utf8'));

// =================== BAC PAGE (FR + AR) ===================
fr.bac = {
  // Hero
  hero: {
    badge: "🎓 Baccalauréat Tunisien 2025-2026",
    titleA: "Tout pour réussir votre",
    titleB: "Bac Tunisie",
    subtitle: "Sujets, corrigés, méthodologie et ressources gratuites pour les 7 sections du Baccalauréat tunisien. Préparation complète, de la 3ème année jusqu'à la session principale.",
    ctaPrimary: "Voir les sujets du Bac",
    ctaSecondary: "Calculer ma moyenne",
    ctaTertiary: "Méthodologie de révision",
  },

  // Stats
  stats: {
    subjects: "Sujets depuis 1994",
    corriges: "Corrigés officiels",
    sections: "7 Sections",
    matieres: "Matières couvertes",
  },

  // Sections
  sections: {
    title: "Les 7 sections du Baccalauréat",
    subtitle: "Choisissez votre section pour accéder aux sujets, corrigés, cours et méthodologie spécifiques à votre filière.",
    items: {
      math: { name: "Mathématiques", desc: "Algèbre, analyse, géométrie. Pour les écoles d'ingénieurs, médecine, classes prépa.", coef: "Coef 4", icon: "📐", color: "blue" },
      scExp: { name: "Sciences Expérimentales", desc: "SVT, Physique, Chimie. Orientation médecine, pharmacie, biologie, sciences.", coef: "Coef 4", icon: "🧪", color: "emerald" },
      scTech: { name: "Sciences Techniques", desc: "Technologie, Physique, Mathématiques appliquées. BTS, IUT, ingénierie.", coef: "Coef 3", icon: "⚙️", color: "slate" },
      scInfo: { name: "Sciences Informatiques", desc: "Algorithmique, développement, systèmes. Écoles d'ingénieurs en informatique.", coef: "Coef 3", icon: "💻", color: "indigo" },
      eco: { name: "Économie et Gestion", desc: "Économie, Gestion, Mathématiques. Commerce, finance, comptabilité, administration.", coef: "Coef 3", icon: "💼", color: "amber" },
      lettres: { name: "Lettres", desc: "Philosophie, Arabe, Français, Histoire-Géographie. Droit, sciences humaines, journalisme.", coef: "Coef 2", icon: "📚", color: "purple" },
      sport: { name: "Sport", desc: "EPS, Biologie, Anatomie. STAPS, métiers du sport, coaching, kinésithérapie.", coef: "Coef 2", icon: "⚽", color: "orange" },
    },
  },

  // Matières
  matieres: {
    title: "Toutes les matières du Bac",
    subtitle: "Préparation complète par matière : cours, séries d'exercices, devoirs types et corrigés détaillés.",
    items: {
      math: "Mathématiques",
      physique: "Sciences Physiques",
      svt: "Sciences de la Vie et de la Terre",
      arabe: "Arabe",
      francais: "Français",
      anglais: "Anglais",
      philo: "Philosophie",
      hg: "Histoire-Géographie",
      eco: "Économie",
      gestion: "Gestion",
      info: "Informatique",
      tech: "Technologie",
      eps: "Éducation Physique",
    },
  },

  // Methodology
  methodo: {
    title: "Méthodologie de révision du Bac",
    subtitle: "Planning de révision en 4 phases pour maximiser vos chances de réussite.",
    step1: { phase: "Phase 1", period: "Septembre → Novembre", title: "Consolider les bases", desc: "Relire tous les cours + mémoriser les formules clés. Aucun exercice d'examen pour l'instant." },
    step2: { phase: "Phase 2", period: "Décembre → Février", title: "Maîtriser les exercices", desc: "Séries d'exercices par chapitre. 3 à 5 séries par semaine, corrigés inclus." },
    step3: { phase: "Phase 3", period: "Mars → Avril", title: "Sujets d'années précédentes", desc: "Sujets 2020-2025 en conditions réelles. Chronomètre, pas de triche, correction rigoureuse." },
    step4: { phase: "Phase 4", period: "Mai → Juin", title: "Bac Blancs intensifs", desc: "3 à 5 bac blancs en conditions d'examen. Identifier les dernières lacunes, fixer les acquis." },
  },

  // Sessions
  sessions: {
    title: "Les deux sessions du Bac",
    subtitle: "Le Bac tunisien se déroule en deux sessions. Préparez-vous pour les deux !",
    principale: {
      name: "Session principale",
      date: "Juin 2025",
      desc: "La première opportunité pour passer l'examen. Les meilleures moyennes sont enregistrées.",
      badge: "Principale",
    },
    controle: {
      name: "Session de contrôle",
      date: "Juillet 2025",
      desc: "Pour les candidats ayant une moyenne entre 9 et 10. Une seconde chance pour décrocher le diplôme.",
      badge: "Rattrapage",
    },
  },

  // Mentions
  mentions: {
    title: "Les mentions au Bac",
    subtitle: "Votre moyenne détermine votre mention. Voici les seuils officiels.",
    passable: "Passable",
    passableRange: "10 — 11.99",
    assezBien: "Assez Bien",
    assezBienRange: "12 — 13.99",
    bien: "Bien",
    bienRange: "14 — 15.99",
    tresBien: "Très Bien",
    tresBienRange: "16 — 17.99",
    excellent: "Excellent",
    excellentRange: "18 et plus",
  },

  // FAQ
  faq: {
    title: "Questions fréquentes sur le Bac",
    items: [
      { q: "Quand a lieu le Bac tunisien 2025 ?", a: "La session principale du Bac tunisien 2025 se déroule en juin 2025. La session de contrôle (rattrapage) a lieu en juillet 2025 pour les candidats ayant obtenu une moyenne entre 9 et 10 à la session principale." },
      { q: "Comment calculer sa moyenne au Bac ?", a: "La moyenne du Bac se calcule comme suit : (Moyenne annuelle × 25%) + (Moyenne des épreuves × 75%), chaque épreuve étant pondérée par son coefficient. Pour la section Math, les coefficients sont par exemple : Math (4), Physique (4), SVT (1), Français (1), Arabe (1), Anglais (1), Philosophie (1), Sport (1), Informatique (1)." },
      { q: "Quelles sont les 7 sections du Bac en Tunisie ?", a: "Les 7 sections officielles du Bac tunisien sont : Mathématiques, Sciences Expérimentales, Sciences Techniques, Sciences Informatiques, Économie et Gestion, Lettres, et Sport. Chaque section a ses propres coefficients et matières." },
      { q: "Comment réussir son Bac en Tunisie ?", a: "Pour réussir votre Bac : 1) Commencez tôt (dès septembre), 2) Faites des séries d'exercices régulièrement, 3) Entraînez-vous sur les sujets des années précédentes, 4) Passez des Bac Blancs, 5) Visez 14+ pour intégrer une bonne école, 16+ pour médecine." },
      { q: "Quel est le taux de réussite au Bac tunisien ?", a: "Le taux de réussite national au Bac tunisien oscille entre 50% et 55% selon les années. Il varie selon les sections : Mathématiques et Sciences Expérimentales affichent 60-70% de réussite, Lettres et Économie-Gestion entre 45-55%." },
      { q: "Quelle est la différence entre la session principale et la session de contrôle ?", a: "La session principale (juin) est la première opportunité. Les candidats avec une moyenne ≥ 10 sont admis. Ceux entre 9 et 10 passent en session de contrôle (juillet) où ils repassent les matières où ils peuvent améliorer leur note. La meilleure moyenne entre les deux sessions est retenue." },
    ],
  },

  // CTA
  cta: {
    title: "Prêt à décrocher votre Bac ?",
    subtitle: "Rejoignez les milliers d'élèves tunisiens qui utilisent Examanet pour réussir leur Baccalauréat.",
    cta1: "Commencer la révision",
    cta2: "Toutes les ressources Bac",
  },
};

// =================== AR ===================
ar.bac = {
  hero: {
    badge: "🎓 الباكالوريا التونسية 2025-2026",
    titleA: "كل ما تحتاجه للنجاح في",
    titleB: "الباكالوريا التونسية",
    subtitle: "مواضيع، إصلاحات، منهجية وموارد مجانية للشعب السبع للباكالوريا التونسية. تحضير كامل، من السنة الثالثة إلى الدورة الرئيسية.",
    ctaPrimary: "عرض مواضيع الباكالوريا",
    ctaSecondary: "احسب معدلك",
    ctaTertiary: "منهجية المراجعة",
  },

  stats: {
    subjects: "مواضيع منذ 1994",
    corriges: "إصلاحات رسمية",
    sections: "7 شعب",
    matieres: "مادة مغطاة",
  },

  sections: {
    title: "الشعب السبع للباكالوريا",
    subtitle: "اختر شعبتك للوصول إلى المواضيع، الإصلاحات، الدروس والمنهجية الخاصة بمجالك.",
    items: {
      math: { name: "الرياضيات", desc: "الجبر، التحليل، الهندسة. لمهارس الهندسة، الطب، الأقسام التحضيرية.", coef: "معامل 4", icon: "📐", color: "blue" },
      scExp: { name: "العلوم التجريبية", desc: "علوم الحياة والأرض، الفيزياء، الكيمياء. الطب، الصيدلة، البيولوجيا، العلوم.", coef: "معامل 4", icon: "🧪", color: "emerald" },
      scTech: { name: "العلوم التقنية", desc: "التكنولوجيا، الفيزياء، الرياضيات التطبيقية. BTS، IUT، الهندسة التقنية.", coef: "معامل 3", icon: "⚙️", color: "slate" },
      scInfo: { name: "علوم الإعلامية", desc: "الخوارزميات، التطوير، الأنظمة. مدارس هندسة الإعلامية.", coef: "معامل 3", icon: "💻", color: "indigo" },
      eco: { name: "الاقتصاد والتصرف", desc: "الاقتصاد، التصرف، الرياضيات. التجارة، المالية، المحاسبة، الإدارة.", coef: "معامل 3", icon: "💼", color: "amber" },
      lettres: { name: "الآداب", desc: "الفلسفة، العربية، الفرنسية، التاريخ والجغرافيا. القانون، العلوم الإنسانية، الصحافة.", coef: "معامل 2", icon: "📚", color: "purple" },
      sport: { name: "الرياضة", desc: "التربية البدنية، البيولوجيا، التشريح. STAPS، مهن الرياضة، التدريب، العلاج الطبيعي.", coef: "معامل 2", icon: "⚽", color: "orange" },
    },
  },

  matieres: {
    title: "جميع مواد الباكالوريا",
    subtitle: "تحضير كامل حسب المادة: دروس، سلاسل تمارين، فروض نموذجية وإصلاحات مفصلة.",
    items: {
      math: "الرياضيات",
      physique: "العلوم الفيزيائية",
      svt: "علوم الحياة والأرض",
      arabe: "العربية",
      francais: "الفرنسية",
      anglais: "الإنجليزية",
      philo: "الفلسفة",
      hg: "التاريخ والجغرافيا",
      eco: "الاقتصاد",
      gestion: "التصرف",
      info: "الإعلامية",
      tech: "التكنولوجيا",
      eps: "التربية البدنية",
    },
  },

  methodo: {
    title: "منهجية مراجعة الباكالوريا",
    subtitle: "برنامج مراجعة في 4 مراحل لتعظيم فرص نجاحك.",
    step1: { phase: "المرحلة 1", period: "سبتمبر → نوفمبر", title: "ترسيخ الأساسيات", desc: "إعادة قراءة جميع الدروس + حفظ الصيغ الأساسية. لا تمارين امتحانات حالياً." },
    step2: { phase: "المرحلة 2", period: "ديسمبر → فيفري", title: "إتقان التمارين", desc: "سلاسل تمارين لكل فصل. 3 إلى 5 سلاسل في الأسبوع، مع الإصلاحات." },
    step3: { phase: "المرحلة 3", period: "مارس → أفريل", title: "مواضيع السنوات السابقة", desc: "مواضيع 2020-2025 في ظروف حقيقية. ساعة توقيت، بدون غش، تصحيح صارم." },
    step4: { phase: "المرحلة 4", period: "ماي → جوان", title: "باكالوريات بيضاء مكثفة", desc: "3 إلى 5 باكالوريات بيضاء في ظروف الامتحان. تحديد النقاط الضعيفة الأخيرة، تثبيت المكتسبات." },
  },

  sessions: {
    title: "دورتا الباكالوريا",
    subtitle: "الباكالوريا التونسية تجرى في دورتين. استعد للدورتين!",
    principale: {
      name: "الدورة الرئيسية",
      date: "جوان 2025",
      desc: "الفرصة الأولى لاجتياز الامتحان. أفضل المعدلات تُسجَّل.",
      badge: "رئيسية",
    },
    controle: {
      name: "دورة المراقبة",
      date: "جويلية 2025",
      desc: "للمرشحين الحاصلين على معدل بين 9 و 10. فرصة ثانية للحصول على الشهادة.",
      badge: "استدراك",
    },
  },

  mentions: {
    title: "منح الباكالوريا",
    subtitle: "معدلك يحدد منحتك. إليك العتبات الرسمية.",
    passable: "مقبول",
    passableRange: "10 — 11.99",
    assezBien: "مستحسن",
    assezBienRange: "12 — 13.99",
    bien: "جيد",
    bienRange: "14 — 15.99",
    tresBien: "جيد جدا",
    tresBienRange: "16 — 17.99",
    excellent: "ممتاز",
    excellentRange: "18 وما فوق",
  },

  faq: {
    title: "أسئلة شائعة حول الباكالوريا",
    items: [
      { q: "متى تجرى الباكالوريا التونسية 2025؟", a: "تجرى الدورة الرئيسية للباكالوريا التونسية 2025 في جوان 2025. أما دورة المراقبة (الاستدراك) فتجرى في جويلية 2025 للمرشحين الحاصلين على معدل بين 9 و 10 في الدورة الرئيسية." },
      { q: "كيف أحسب معدلي في الباكالوريا؟", a: "يُحسب معدل الباكالوريا كما يلي: (المعدل السنوي × 25٪) + (معدل الامتحانات × 75٪)، كل امتحان مرجح بمعامله. مثلاً لشعبة الرياضيات، المعاملات هي: الرياضيات (4)، الفيزياء (4)، علوم الحياة والأرض (1)، الفرنسية (1)، العربية (1)، الإنجليزية (1)، الفلسفة (1)، الرياضة (1)، الإعلامية (1)." },
      { q: "ما هي الشعب السبع للباكالوريا في تونس؟", a: "الشعب السبع الرسمية للباكالوريا التونسية هي: الرياضيات، العلوم التجريبية، العلوم التقنية، علوم الإعلامية، الاقتصاد والتصرف، الآداب، والرياضة. لكل شعبة معاملاتها وموادها الخاصة." },
      { q: "كيف أنجح في الباكالوريا في تونس؟", a: "للنجاح في الباكالوريا: 1) ابدأ مبكراً (من سبتمبر)، 2) حل سلاسل التمارين بانتظام، 3) تدرب على مواضيع السنوات السابقة، 4) اختبر نفسك في باكالوريات بيضاء، 5) استهدف 14+ للالتحاق بمدرسة جيدة، 16+ للطب." },
      { q: "ما هو معدل النجاح في الباكالوريا التونسية؟", a: "يتذبذب معدل النجاح الوطني في الباكالوريا التونسية بين 50٪ و 55٪ حسب السنوات. يختلف حسب الشعب: الرياضيات والعلوم التجريبية تسجل 60-70٪ نجاح، الآداب والاقتصاد-التصرف بين 45-55٪." },
      { q: "ما الفرق بين الدورة الرئيسية ودورة المراقبة؟", a: "الدورة الرئيسية (جوان) هي الفرصة الأولى. المرشحون بمعدل ≥ 10 ينجحون. الذين بين 9 و 10 يشاركون في دورة المراقبة (جويلية) حيث يعيدون الاختبارات في المواد التي يمكنهم تحسينها. يُحتسب أفضل معدل بين الدورتين." },
    ],
  },

  cta: {
    title: "مستعد للحصول على الباكالوريا؟",
    subtitle: "انضم إلى آلاف التلاميذ التونسيين الذين يستخدمون إكسامانت للنجاح في الباكالوريا.",
    cta1: "ابدأ المراجعة",
    cta2: "جميع موارد الباكالوريا",
  },
};

fs.writeFileSync('./src/messages/fr.json', JSON.stringify(fr, null, 2) + '\n');
fs.writeFileSync('./src/messages/ar.json', JSON.stringify(ar, null, 2) + '\n');
console.log('BAC page translations added');
