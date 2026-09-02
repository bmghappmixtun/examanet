import fs from 'fs';
const fr = JSON.parse(fs.readFileSync('./src/messages/fr.json', 'utf8'));
const ar = JSON.parse(fs.readFileSync('./src/messages/ar.json', 'utf8'));

fr.college = {
  hero: {
    breadcrumb: "Collège (Enseignement de base)",
    badge: "Enseignement de base — Cycle 1",
    titleStart: "Toutes les ressources du ",
    titleGradient: "collège tunisien",
    titleEnd: "",
    subtitle: "+{count} ressources gratuites pour la 7ème, 8ème et 9ème année de base : cours, devoirs, séries d'exercices, sujets d'examen et corrigés, conformes au programme officiel tunisien.",
    cta1: "Voir par classe",
    cta2: "Voir par matière",
  },
  stats: {
    ressources: "Ressources",
    classes: "Classes",
    matieres: "Matières",
    gratuit: "Gratuit",
  },
  problem: {
    title: "Le problème qu'on résout",
    p1: "Trop d'élèves tunisiens accèdent à des ressources obsolètes, incomplètes ou payantes. Les photocopies des manuels scolaires, les fichiers PDF dispersés sur des forums, les vidéos YouTube non structurées : tout ça rend la révision inefficace.",
    p2: "Examanet centralise tout ce dont tu as besoin pour réussir ton année au collège : des cours bien structurés, des devoirs types, des séries d'exercices avec corrigés, et tout ça 100% gratuit.",
    p3: "Que tu sois en 7ème année de base (collège), en 8ème année ou en 9ème année (dernière année avant le lycée), tu trouveras des ressources alignées sur le programme officiel du Ministère de l'Éducation tunisien.",
  },
  features: {
    f1: { title: 'Conforme au programme officiel', desc: 'Toutes les ressources suivent le programme 2026-2027' },
    f2: { title: 'Mis à jour régulièrement', desc: 'De nouvelles ressources ajoutées chaque semaine' },
    f3: { title: 'Vérifié par des enseignants', desc: 'Tous les contenus sont validés par des profs tunisiens' },
    f4: { title: 'Couvre toutes les matières', desc: 'Math, Physique, SVT, Français, Arabe, Anglais...' },
    f5: { title: 'Avec corrigés', desc: 'Vérifie tes réponses avec les corrigés détaillés' },
    f6: { title: 'Accès 24/7', desc: 'Révise quand tu veux, sans inscription' },
  },
};

ar.college = {
  hero: {
    breadcrumb: "الإعدادي (التعليم الأساسي)",
    badge: "التعليم الأساسي — الحلقة الأولى",
    titleStart: "جميع موارد ",
    titleGradient: "الإعدادي التونسي",
    titleEnd: "",
    subtitle: "+{count} مورد مجاني للسنة السابعة والثامنة والتاسعة أساسي: دروس، فروض، سلاسل تمارين، مواضيع امتحانات وإصلاحات، متوافقة مع البرنامج الرسمي التونسي.",
    cta1: "حسب القسم",
    cta2: "حسب المادة",
  },
  stats: {
    ressources: "موارد",
    classes: "أقسام",
    matieres: "مواد",
    gratuit: "مجاني",
  },
  problem: {
    title: "المشكلة التي نحلها",
    p1: "عدد كبير من التلاميذ التونسيين يصلون إلى موارد قديمة أو غير مكتملة أو مدفوعة. نسخ الكتب المدرسية، ملفات PDF متناثرة على المنتديات، فيديوهات يوتيوب غير منظمة: كل هذا يجعل المراجعة غير فعالة.",
    p2: "إكسامانت تجمع كل ما تحتاجه للنجاح في سنتك في الإعدادي: دروس منظمة جيداً، فروض نموذجية، سلاسل تمارين مع إصلاحات، وكل هذا مجاني 100%.",
    p3: "سواء كنت في السنة السابعة أساسي (إعدادي)، أو في السنة الثامنة، أو في السنة التاسعة (السنة الأخيرة قبل الثانوية)، ستجد موارد متوافقة مع البرنامج الرسمي لوزارة التربية التونسية.",
  },
  features: {
    f1: { title: 'متوافق مع البرنامج الرسمي', desc: 'جميع الموارد تتبع برنامج 2026-2027' },
    f2: { title: 'محدّث بانتظام', desc: 'إضافة موارد جديدة كل أسبوع' },
    f3: { title: 'تم التحقق منها من قبل المعلمين', desc: 'جميع المحتويات تم التحقق منها من قبل معلمين تونسيين' },
    f4: { title: 'يغطي جميع المواد', desc: 'رياضيات، فيزياء، علوم، فرنسية، عربية، إنجليزية...' },
    f5: { title: 'مع إصلاحات', desc: 'تحقق من إجاباتك مع الإصلاحات المفصلة' },
    f6: { title: 'الوصول 24/7', desc: 'راجع متى تشاء، دون تسجيل' },
  },
};

fs.writeFileSync('./src/messages/fr.json', JSON.stringify(fr, null, 2) + '\n');
fs.writeFileSync('./src/messages/ar.json', JSON.stringify(ar, null, 2) + '\n');
console.log('college added');
