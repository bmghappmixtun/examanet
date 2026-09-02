import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding PostgreSQL database...');

  // Clean
  await prisma.notification.deleteMany();
  await prisma.report.deleteMany();
  await prisma.share.deleteMany();
  await prisma.download.deleteMany();
  await prisma.view.deleteMany();
  await prisma.favorite.deleteMany();
  await prisma.rating.deleteMany();
  await prisma.comment.deleteMany();
  await prisma.resource.deleteMany();
  await prisma.section.deleteMany();
  await prisma.class.deleteMany();
  await prisma.subject.deleteMany();
  await prisma.level.deleteMany();
  await prisma.session.deleteMany();
  await prisma.otpCode.deleteMany();
  await prisma.user.deleteMany();
  await prisma.newsletter.deleteMany();
  await prisma.setting.deleteMany();

  const primaire = await prisma.level.create({ data: { slug: 'primaire', nameFr: 'Primaire', nameAr: 'الابتدائي', order: 1 } });
  const college = await prisma.level.create({ data: { slug: 'college', nameFr: 'Collège', nameAr: 'الإعدادي', order: 2 } });
  const lycee = await prisma.level.create({ data: { slug: 'lycee', nameFr: 'Lycée', nameAr: 'الثانوي', order: 3 } });

  const classes = await Promise.all([
    prisma.class.create({ data: { levelId: primaire.id, slug: '1ere', nameFr: '1ère année', nameAr: 'الأول ابتدائي', order: 1 } }),
    prisma.class.create({ data: { levelId: primaire.id, slug: '2eme', nameFr: '2ème année', nameAr: 'الثاني ابتدائي', order: 2 } }),
    prisma.class.create({ data: { levelId: primaire.id, slug: '3eme', nameFr: '3ème année', nameAr: 'الثالث ابتدائي', order: 3 } }),
    prisma.class.create({ data: { levelId: primaire.id, slug: '4eme', nameFr: '4ème année', nameAr: 'الرابع ابتدائي', order: 4 } }),
    prisma.class.create({ data: { levelId: primaire.id, slug: '5eme', nameFr: '5ème année', nameAr: 'الخامس ابتدائي', order: 5 } }),
    prisma.class.create({ data: { levelId: primaire.id, slug: '6eme', nameFr: '6ème année', nameAr: 'السادس ابتدائي', order: 6 } }),
    prisma.class.create({ data: { levelId: college.id, slug: '7eme', nameFr: '7ème année de base', nameAr: 'السابع أساسي', order: 1 } }),
    prisma.class.create({ data: { levelId: college.id, slug: '8eme', nameFr: '8ème année de base', nameAr: 'الثامن أساسي', order: 2 } }),
    prisma.class.create({ data: { levelId: college.id, slug: '9eme', nameFr: '9ème année de base', nameAr: 'التاسع أساسي', order: 3 } }),
    prisma.class.create({ data: { levelId: lycee.id, slug: '1ere-secondaire', nameFr: '1ère année secondaire', nameAr: 'الأول ثانوي', order: 1 } }),
    prisma.class.create({ data: { levelId: lycee.id, slug: '2eme-secondaire', nameFr: '2ème année secondaire', nameAr: 'الثاني ثانوي', order: 2 } }),
    prisma.class.create({ data: { levelId: lycee.id, slug: '3eme-secondaire', nameFr: '3ème année secondaire', nameAr: 'الثالث ثانوي', order: 3 } }),
    prisma.class.create({ data: { levelId: lycee.id, slug: '4eme-secondaire', nameFr: '4ème année secondaire (Bac)', nameAr: 'الباكالوريا', order: 4 } }),
  ]);

  const lyceeClasses = classes.filter(c => c.levelId === lycee.id);
  for (const cls of lyceeClasses) {
    await prisma.section.create({ data: { classId: cls.id, slug: 'sciences', nameFr: 'Sciences', nameAr: 'علوم' } });
    await prisma.section.create({ data: { classId: cls.id, slug: 'maths', nameFr: 'Mathématiques', nameAr: 'رياضيات' } });
    await prisma.section.create({ data: { classId: cls.id, slug: 'lettres', nameFr: 'Lettres', nameAr: 'آداب' } });
    await prisma.section.create({ data: { classId: cls.id, slug: 'eco-gestion', nameFr: 'Économie-Gestion', nameAr: 'اقتصاد وتصرف' } });
    await prisma.section.create({ data: { classId: cls.id, slug: 'technique', nameFr: 'Technique', nameAr: 'تقني' } });
    await prisma.section.create({ data: { classId: cls.id, slug: 'info', nameFr: 'Informatique', nameAr: 'إعلامية' } });
  }

  const subjectsData = [
    { slug: 'mathematiques', nameFr: 'Mathématiques', nameAr: 'الرياضيات', icon: 'Calculator', color: '#0EA5E9', order: 1 },
    { slug: 'physique', nameFr: 'Physique', nameAr: 'الفيزياء', icon: 'Atom', color: '#8B5CF6', order: 2 },
    { slug: 'svt', nameFr: 'Sciences de la Vie et de la Terre', nameAr: 'علوم الحياة والأرض', icon: 'Leaf', color: '#10B981', order: 3 },
    { slug: 'francais', nameFr: 'Français', nameAr: 'الفرنسية', icon: 'BookOpen', color: '#EF4444', order: 4 },
    { slug: 'arabe', nameFr: 'Arabe', nameAr: 'العربية', icon: 'Languages', color: '#F59E0B', order: 5 },
    { slug: 'anglais', nameFr: 'Anglais', nameAr: 'الإنجليزية', icon: 'Globe', color: '#3B82F6', order: 6 },
    { slug: 'histoire', nameFr: 'Histoire', nameAr: 'التاريخ', icon: 'Scroll', color: '#A16207', order: 7 },
    { slug: 'geographie', nameFr: 'Géographie', nameAr: 'الجغرافيا', icon: 'Map', color: '#059669', order: 8 },
    { slug: 'philosophie', nameFr: 'Philosophie', nameAr: 'الفلسفة', icon: 'Brain', color: '#7C3AED', order: 9 },
    { slug: 'economie', nameFr: 'Économie', nameAr: 'الاقتصاد', icon: 'TrendingUp', color: '#DC2626', order: 10 },
    { slug: 'gestion', nameFr: 'Gestion', nameAr: 'التصرف', icon: 'Briefcase', color: '#0891B2', order: 11 },
    { slug: 'informatique', nameFr: 'Informatique', nameAr: 'الإعلامية', icon: 'Monitor', color: '#1E40AF', order: 12 },
    { slug: 'technologie', nameFr: 'Technologie', nameAr: 'التكنولوجيا', icon: 'Cpu', color: '#475569', order: 13 },
    { slug: 'sport', nameFr: 'Éducation Physique', nameAr: 'الرياضة', icon: 'Trophy', color: '#EA580C', order: 14 },
    { slug: 'arts', nameFr: 'Arts Plastiques', nameAr: 'الفنون', icon: 'Palette', color: '#DB2777', order: 15 },
    { slug: 'musique', nameFr: 'Musique', nameAr: 'الموسيقى', icon: 'Music', color: '#9333EA', order: 16 },
  ];
  const subjects = await Promise.all(subjectsData.map(s => prisma.subject.create({ data: s })));

  const passwordHash = await bcrypt.hash('demo1234', 10);

  const admin = await prisma.user.create({
    data: {
      email: 'admin@examanet.com',
      passwordHash, role: 'ADMIN', status: 'ACTIVE',
      emailVerifiedAt: new Date(),
      firstName: 'Admin', lastName: 'Principal',
      schoolName: 'Examanet', governorate: 'Tunis',
    }
  });

  const teachersData = [
    { email: 'ahmed.benali@examanet.com', firstName: 'Ahmed', lastName: 'Ben Ali', subjects: ['mathematiques'], school: 'Lycée Bourguiba, Tunis', gov: 'Tunis' },
    { email: 'fatma.trabelsi@examanet.com', firstName: 'Fatma', lastName: 'Trabelsi', subjects: ['physique'], school: 'Lycée Carnot, Tunis', gov: 'Tunis' },
    { email: 'mohamed.gharbi@examanet.com', firstName: 'Mohamed', lastName: 'Gharbi', subjects: ['svt'], school: 'Collège Pilote, Sfax', gov: 'Sfax' },
    { email: 'leila.bouzid@examanet.com', firstName: 'Leila', lastName: 'Bouzid', subjects: ['francais', 'arabe'], school: 'Collège 7 Novembre, Sousse', gov: 'Sousse' },
    { email: 'karim.jendoubi@examanet.com', firstName: 'Karim', lastName: 'Jendoubi', subjects: ['anglais'], school: 'Lycée Technique, Monastir', gov: 'Monastir' },
    { email: 'sarra.mansouri@examanet.com', firstName: 'Sarra', lastName: 'Mansouri', subjects: ['philosophie', 'histoire'], school: 'Lycée Alaoui, Tunis', gov: 'Tunis' },
    { email: 'youssef.daoud@examanet.com', firstName: 'Youssef', lastName: 'Daoud', subjects: ['informatique', 'technologie'], school: 'Lycée Technique, Sfax', gov: 'Sfax' },
    { email: 'amina.khelifi@examanet.com', firstName: 'Amina', lastName: 'Khelifi', subjects: ['mathematiques', 'physique'], school: 'Collège Pilote, Nabeul', gov: 'Nabeul' },
  ];
  const teachers = await Promise.all(teachersData.map(t => prisma.user.create({
    data: {
      email: t.email, passwordHash, role: 'TEACHER', status: 'ACTIVE',
      emailVerifiedAt: new Date(), isVerifiedTeacher: true,
      approvedAt: new Date(), approvedById: admin.id,
      firstName: t.firstName, lastName: t.lastName,
      schoolName: t.school, governorate: t.gov,
      bio: 'Professeur passionné avec plus de 10 ans d\'expérience dans l\'enseignement.',
      teachingSubjects: JSON.stringify(t.subjects),
      lastLoginAt: new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000),
    }
  })));

  const studentsData = [
    { firstName: 'Yassine', lastName: 'Hamdi', email: 'yassine@example.com', classLevel: '4eme-secondaire', section: 'sciences', school: 'Lycée Bourguiba, Tunis' },
    { firstName: 'Mariem', lastName: 'Baccouche', email: 'mariem@example.com', classLevel: '3eme-secondaire', section: 'maths', school: 'Lycée Carnot, Tunis' },
    { firstName: 'Ala', lastName: 'Ben Salah', email: 'ala@example.com', classLevel: '2eme-secondaire', section: 'sciences', school: 'Lycée Pilote, Sfax' },
    { firstName: 'Salma', lastName: 'Riahi', email: 'salma@example.com', classLevel: '1ere-secondaire', section: 'lettres', school: 'Lycée Alaoui, Tunis' },
    { firstName: 'Hicham', lastName: 'Jouini', email: 'hicham@example.com', classLevel: '9eme', school: 'Collège Pilote, Sousse' },
    { firstName: 'Nour', lastName: 'Mejri', email: 'nour@example.com', classLevel: '8eme', school: 'Collège 7 Novembre, Sousse' },
    { firstName: 'Ramy', lastName: 'Bouazizi', email: 'ramy@example.com', classLevel: '7eme', school: 'Collège Pilote, Nabeul' },
  ];
  const students = await Promise.all(studentsData.map(s => prisma.user.create({
    data: {
      email: s.email, passwordHash, role: 'STUDENT', status: 'ACTIVE',
      emailVerifiedAt: new Date(),
      firstName: s.firstName, lastName: s.lastName,
      schoolName: s.school, classLevel: s.classLevel, section: s.section,
      governorate: 'Tunis',
      lastLoginAt: new Date(Date.now() - Math.random() * 3 * 24 * 60 * 60 * 1000),
    }
  })));

  const resourceTypes = ['COURSE', 'DEVOIR', 'EXERCISE', 'REVISION', 'EXAM', 'BAC_SUBJECT', 'CORRECTION', 'SUMMARY'];
  const resourcesData = [
    { title: 'Devoir de synthèse n°3 — Mathématiques Bac 2024', desc: 'Devoir complet couvrant algèbre, analyse et probabilités avec corrigé détaillé.', type: 'DEVOIR', subject: 'mathematiques', class: '4eme-secondaire', section: 'sciences', teacherIdx: 0, trimester: '3', year: '2023-2024' },
    { title: 'Cours complet — Électricité et Magnétisme', desc: 'Cours détaillé avec illustrations, formules et exemples pour la 3ème année.', type: 'COURSE', subject: 'physique', class: '3eme-secondaire', section: 'sciences', teacherIdx: 1, trimester: '2', year: '2023-2024' },
    { title: 'Corrigé officiel — Bac Sciences 2024', desc: 'Corrigé complet de l\'épreuve de SVT du Baccalauréat 2024 Session Principale.', type: 'CORRECTION', subject: 'svt', class: '4eme-secondaire', section: 'sciences', teacherIdx: 2, trimester: '3', year: '2023-2024' },
    { title: 'Série d\'exercices — Production écrite', desc: '20 sujets de production écrite pour le Bac avec méthodologie complète.', type: 'EXERCISE', subject: 'francais', class: '4eme-secondaire', section: 'lettres', teacherIdx: 3, trimester: '1', year: '2023-2024' },
    { title: 'English Bac Mock Exam 2024', desc: 'Full mock exam with listening, reading, writing sections. With audio transcript.', type: 'EXAM', subject: 'anglais', class: '4eme-secondaire', section: 'sciences', teacherIdx: 4, trimester: '2', year: '2023-2024' },
    { title: 'Cours de Philosophie — La conscience', desc: 'Fiche de cours sur le thème de la conscience avec citations et analyse.', type: 'COURSE', subject: 'philosophie', class: '3eme-secondaire', section: 'lettres', teacherIdx: 5, trimester: '1', year: '2023-2024' },
    { title: 'Algorithmique et Python — TD1', desc: 'Travaux dirigés sur les bases de Python : variables, boucles, fonctions.', type: 'EXERCISE', subject: 'informatique', class: '2eme-secondaire', section: 'sciences', teacherIdx: 6, trimester: '1', year: '2023-2024' },
    { title: 'Devoir surveillé — Mathématiques 9ème', desc: 'DS complet pour la 9ème année de base : calcul littéral, équations, géométrie.', type: 'EXAM', subject: 'mathematiques', class: '9eme', teacherIdx: 7, trimester: '2', year: '2023-2024' },
    { title: 'Fiche de révision — Bac Maths 2024', desc: 'Toutes les formules et théorèmes essentiels à connaître pour le Bac.', type: 'REVISION', subject: 'mathematiques', class: '4eme-secondaire', section: 'sciences', teacherIdx: 0, trimester: '3', year: '2023-2024' },
    { title: 'Sujet Bac — Physique 2023 Session Principale', desc: 'Sujet officiel du Bac Physique 2023 avec barème de notation.', type: 'BAC_SUBJECT', subject: 'physique', class: '4eme-secondaire', section: 'sciences', teacherIdx: 1, trimester: '3', year: '2022-2023' },
    { title: 'Résumé — La cellule animale et végétale', desc: 'Résumé illustré du chapitre sur la cellule pour 1ère année secondaire.', type: 'SUMMARY', subject: 'svt', class: '1ere-secondaire', section: 'sciences', teacherIdx: 2, trimester: '1', year: '2023-2024' },
    { title: 'Contrôle continu — Arabe 8ème', desc: 'Contrôle de compréhension et d\'expression écrite pour la 8ème année.', type: 'EXAM', subject: 'arabe', class: '8eme', teacherIdx: 3, trimester: '2', year: '2023-2024' },
    { title: 'Histoire — Le monde contemporain', desc: 'Cours complet sur le monde contemporain de 1945 à nos jours.', type: 'COURSE', subject: 'histoire', class: '3eme-secondaire', section: 'lettres', teacherIdx: 5, trimester: '2', year: '2023-2024' },
    { title: 'TD Algorithmique — Les boucles', desc: 'Exercices progressifs sur les structures itératives en algorithmique.', type: 'EXERCISE', subject: 'informatique', class: '1ere-secondaire', section: 'sciences', teacherIdx: 6, trimester: '2', year: '2023-2024' },
    { title: 'Devoir de maison — Physique 3ème', desc: 'Devoir de maison sur l\'optique géométrique avec exercices corrigés.', type: 'DEVOIR', subject: 'physique', class: '3eme-secondaire', section: 'sciences', teacherIdx: 1, trimester: '1', year: '2023-2024' },
    { title: 'Sujets Bac — Maths 2020-2024', desc: 'Compilation des 5 dernières sessions du Bac Maths avec corrigés.', type: 'BAC_SUBJECT', subject: 'mathematiques', class: '4eme-secondaire', section: 'maths', teacherIdx: 0, trimester: '3', year: '2023-2024' },
    { title: 'Économie — Le marché et les prix', desc: 'Cours complet sur le mécanisme du marché avec schémas explicatifs.', type: 'COURSE', subject: 'economie', class: '3eme-secondaire', section: 'eco-gestion', teacherIdx: 5, trimester: '1', year: '2023-2024' },
    { title: 'Anglais — Grammar revision pack', desc: 'Pack de révision grammaticale pour Bac : temps, conditionnel, voix passive.', type: 'REVISION', subject: 'anglais', class: '4eme-secondaire', section: 'sciences', teacherIdx: 4, trimester: '2', year: '2023-2024' },
    { title: 'Technologie — Les réseaux informatiques', desc: 'Cours sur les réseaux LAN, WAN, Internet avec schémas et exercices.', type: 'COURSE', subject: 'technologie', class: '2eme-secondaire', section: 'technique', teacherIdx: 6, trimester: '1', year: '2023-2024' },
    { title: 'Géographie — La mondialisation', desc: 'Fiche de cours complète sur la mondialisation et ses acteurs.', type: 'SUMMARY', subject: 'geographie', class: '3eme-secondaire', section: 'eco-gestion', teacherIdx: 5, trimester: '2', year: '2023-2024' },
    { title: 'Série d\'exercices — SVT 1ère année', desc: '20 exercices sur la cellule, la reproduction et la génétique.', type: 'EXERCISE', subject: 'svt', class: '1ere-secondaire', section: 'sciences', teacherIdx: 2, trimester: '1', year: '2023-2024' },
    { title: 'Bac Blanc — Mathématiques 2024', desc: 'Sujet de Bac blanc avec tous les thèmes du programme officiel.', type: 'EXAM', subject: 'mathematiques', class: '4eme-secondaire', section: 'sciences', teacherIdx: 0, trimester: '2', year: '2023-2024' },
    { title: 'Cours Arabe — النصوص الأدبية', desc: 'شرح مفصل للنصوص الأدبية المبرمجة في الباكالوريا.', type: 'COURSE', subject: 'arabe', class: '4eme-secondaire', section: 'lettres', teacherIdx: 3, trimester: '1', year: '2023-2024' },
    { title: 'Philosophie — La liberté', desc: 'Dissertation philosophique sur le thème de la liberté avec introduction et conclusion.', type: 'COURSE', subject: 'philosophie', class: '4eme-secondaire', section: 'lettres', teacherIdx: 5, trimester: '2', year: '2023-2024' },
  ];

  for (const r of resourcesData) {
    const subject = subjects.find(s => s.slug === r.subject)!;
    const cls = classes.find(c => c.slug === r.class)!;
    const section = r.section ? await prisma.section.findFirst({ where: { classId: cls.id, slug: r.section } }) : null;
    const teacher = teachers[r.teacherIdx];

    const slug = r.title.toLowerCase()
      .replace(/[àáâãäå]/g, 'a').replace(/[èéêë]/g, 'e').replace(/[ìíîï]/g, 'i')
      .replace(/[òóôõö]/g, 'o').replace(/[ùúûü]/g, 'u').replace(/[ç]/g, 'c')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').substring(0, 80);

    const viewsCount = Math.floor(Math.random() * 5000) + 100;
    const downloadsCount = Math.floor(viewsCount * (0.3 + Math.random() * 0.3));
    const avgRating = 3.5 + Math.random() * 1.5;
    const ratingCount = Math.floor(Math.random() * 100) + 5;
    const commentsCount = Math.floor(Math.random() * 30);

    const resource = await prisma.resource.create({
      data: {
        slug: slug + '-' + Math.random().toString(36).substring(2, 7),
        title: r.title,
        description: r.desc,
        type: r.type,
        status: 'PUBLISHED',
        fileKey: `sample-${slug}.pdf`,
        fileUrl: '/sample-pdf.pdf',
        fileSize: Math.floor(Math.random() * 3000000) + 200000,
        pageCount: Math.floor(Math.random() * 20) + 5,
        classId: cls.id,
        sectionId: section?.id,
        subjectId: subject.id,
        teacherId: teacher.id,
        trimester: r.trimester,
        year: r.year,
        tags: ['bac-2024', r.subject, r.class, 'tunisie'].join(','),
        language: r.subject === 'arabe' ? 'ar' : 'fr',
        viewsCount, downloadsCount,
        sharesCount: Math.floor(viewsCount * 0.05),
        favoritesCount: Math.floor(viewsCount * 0.08),
        commentsCount, avgRating, ratingCount,
        approvedAt: new Date(Date.now() - Math.random() * 60 * 24 * 60 * 60 * 1000),
        approvedById: admin.id,
        publishedAt: new Date(Date.now() - Math.random() * 60 * 24 * 60 * 60 * 1000),
      }
    });

    if (commentsCount > 0) {
      for (let i = 0; i < Math.min(commentsCount, 3); i++) {
        const student = students[Math.floor(Math.random() * students.length)];
        await prisma.comment.create({
          data: {
            resourceId: resource.id, userId: student.id,
            content: [
              'Excellent document, merci beaucoup !', 'Très utile pour mes révisions du Bac.',
              'Le corrigé est très détaillé, parfait pour comprendre.',
              'Bonne qualité, je recommande !', 'M\'a beaucoup aidé pour préparer mon contrôle.',
            ][i % 5],
          }
        });
      }
    }

    for (let i = 0; i < Math.min(ratingCount, 10); i++) {
      const student = students[i % students.length];
      try {
        await prisma.rating.create({
          data: {
            resourceId: resource.id, userId: student.id,
            stars: Math.max(3, Math.min(5, Math.round(avgRating + (Math.random() - 0.5)))),
          }
        });
      } catch (e) {}
    }
  }

  await prisma.setting.create({ data: { key: 'site_name', value: 'Examanet' } });
  await prisma.setting.create({ data: { key: 'site_tagline', value: 'La plateforme pédagogique #1 en Tunisie' } });
  await prisma.setting.create({ data: { key: 'contact_email', value: 'contact@examanet.com' } });

  console.log('✅ Seed completed for PostgreSQL!');
}

main().catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
