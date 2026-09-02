import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

export const runtime = 'nodejs';
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  // Auth check - only allow with admin secret
  const authHeader = req.headers.get('authorization');
  const { searchParams } = new URL(req.url);
  const token = searchParams.get('token');

  if (token !== process.env.SEED_TOKEN && authHeader !== `Bearer ${process.env.SEED_TOKEN}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    console.log('🌱 Starting seed...');

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

    // Levels (Enseignement de base = Collège cycle, Enseignement Secondaire = Lycée)
    const college = await prisma.level.create({
      data: {
        slug: 'college',
        nameFr: 'Enseignement de base',
        nameAr: 'التعليم الأساسي',
        order: 2,
      },
    });
    const lycee = await prisma.level.create({
      data: {
        slug: 'lycee',
        nameFr: 'Enseignement Secondaire',
        nameAr: 'التعليم الثانوي',
        order: 3,
      },
    });

    // Classes
    const classes = await Promise.all([
      prisma.class.create({
        data: {
          levelId: college.id,
          slug: '7eme',
          nameFr: '7ème année de base',
          nameAr: 'السابع أساسي',
          order: 1,
        },
      }),
      prisma.class.create({
        data: {
          levelId: college.id,
          slug: '8eme',
          nameFr: '8ème année de base',
          nameAr: 'الثامن أساسي',
          order: 2,
        },
      }),
      prisma.class.create({
        data: {
          levelId: college.id,
          slug: '9eme',
          nameFr: '9ème année de base',
          nameAr: 'التاسع أساسي',
          order: 3,
        },
      }),
      prisma.class.create({
        data: {
          levelId: lycee.id,
          slug: '1ere-secondaire',
          nameFr: '1ère année secondaire',
          nameAr: 'الأول ثانوي',
          order: 1,
        },
      }),
      prisma.class.create({
        data: {
          levelId: lycee.id,
          slug: '2eme-secondaire',
          nameFr: '2ème année secondaire',
          nameAr: 'الثاني ثانوي',
          order: 2,
        },
      }),
      prisma.class.create({
        data: {
          levelId: lycee.id,
          slug: '3eme-secondaire',
          nameFr: '3ème année secondaire',
          nameAr: 'الثالث ثانوي',
          order: 3,
        },
      }),
      prisma.class.create({
        data: {
          levelId: lycee.id,
          slug: '4eme-secondaire',
          nameFr: '4ème année secondaire (Bac)',
          nameAr: 'الباكالوريا',
          order: 4,
        },
      }),
    ]);

    // Sections for lycée (per official Tunisian curriculum)
    // 2AS = 5 sections, 3AS/4AS = 7 sections
    const lyceeClasses = classes.filter((c) => c.levelId === lycee.id);
    for (const cls of lyceeClasses) {
      const is4AS = cls.slug === '4eme-secondaire';
      const is3AS = cls.slug === '3eme-secondaire';
      // Sciences has different name per class (2AS = Sciences, 3AS/4AS = Sciences Expérimentales)
      const sciencesSection = is4AS
        ? {
            slug: 'sciences-experimentales',
            nameFr: 'Bac Sciences Expérimentales',
            nameAr: 'باك علوم تجريبية',
          }
        : is3AS
          ? {
              slug: 'sciences-experimentales',
              nameFr: 'Sciences Expérimentales',
              nameAr: 'علوم تجريبية',
            }
          : { slug: 'sciences', nameFr: 'Sciences', nameAr: 'علوم' };
      await prisma.section.create({ data: { classId: cls.id, ...sciencesSection } });
      // Maths (4AS has 'Bac Mathématiques' prefix per teacher-workflow-data.ts)
      const mathsSection = is4AS
        ? { slug: 'maths', nameFr: 'Bac Mathématiques', nameAr: 'باك رياضيات' }
        : is3AS
          ? { slug: 'maths', nameFr: 'Mathématiques', nameAr: 'رياضيات' }
          : { slug: 'maths', nameFr: 'Mathématiques', nameAr: 'رياضيات' };
      await prisma.section.create({ data: { classId: cls.id, ...mathsSection } });
      await prisma.section.create({
        data: { classId: cls.id, slug: 'lettres', nameFr: 'Lettres', nameAr: 'آداب' },
      });
      // Eco-Gestion: 2AS = "Économie et services" (different), 3AS/4AS = "Économie-Gestion"
      const ecoSection =
        cls.slug === '2eme-secondaire'
          ? { slug: 'eco-services', nameFr: 'Économie et services', nameAr: 'اقتصاد وتصرف' }
          : { slug: 'eco-gestion', nameFr: 'Économie-Gestion', nameAr: 'اقتصاد وتصرف' };
      await prisma.section.create({ data: { classId: cls.id, ...ecoSection } });
      // Technique: 4AS = "Bac Sciences Techniques" (3AS uses just "Technique")
      const techniqueSection = is4AS
        ? { slug: 'technique', nameFr: 'Bac Sciences Techniques', nameAr: 'باك تقني' }
        : is3AS
          ? { slug: 'technique', nameFr: 'Sciences Techniques', nameAr: 'تقني' }
          : { slug: 'technique', nameFr: 'Technique', nameAr: 'تقني' };
      await prisma.section.create({ data: { classId: cls.id, ...techniqueSection } });
      await prisma.section.create({
        data: { classId: cls.id, slug: 'info', nameFr: 'Informatique', nameAr: 'إعلامية' },
      });
    }

    // Subjects
    const subjectsData = [
      {
        slug: 'mathematiques',
        nameFr: 'Mathématiques',
        nameAr: 'الرياضيات',
        color: '#0EA5E9',
        order: 1,
      },
      { slug: 'physique', nameFr: 'Physique', nameAr: 'الفيزياء', color: '#8B5CF6', order: 2 },
      {
        slug: 'svt',
        nameFr: 'Sciences de la Vie et de la Terre',
        nameAr: 'علوم الحياة والأرض',
        color: '#10B981',
        order: 3,
      },
      { slug: 'francais', nameFr: 'Français', nameAr: 'الفرنسية', color: '#EF4444', order: 4 },
      { slug: 'arabe', nameFr: 'Arabe', nameAr: 'العربية', color: '#F59E0B', order: 5 },
      { slug: 'anglais', nameFr: 'Anglais', nameAr: 'الإنجليزية', color: '#3B82F6', order: 6 },
      { slug: 'histoire', nameFr: 'Histoire', nameAr: 'التاريخ', color: '#A16207', order: 7 },
      { slug: 'geographie', nameFr: 'Géographie', nameAr: 'الجغرافيا', color: '#059669', order: 8 },
      { slug: 'philosophie', nameFr: 'Philosophie', nameAr: 'الفلسفة', color: '#7C3AED', order: 9 },
      { slug: 'economie', nameFr: 'Économie', nameAr: 'الاقتصاد', color: '#DC2626', order: 10 },
      { slug: 'gestion', nameFr: 'Gestion', nameAr: 'التصرف', color: '#0891B2', order: 11 },
      {
        slug: 'informatique',
        nameFr: 'Informatique',
        nameAr: 'الإعلامية',
        color: '#1E40AF',
        order: 12,
      },
      {
        slug: 'technologie',
        nameFr: 'Technologie',
        nameAr: 'التكنولوجيا',
        color: '#475569',
        order: 13,
      },
      {
        slug: 'sport',
        nameFr: 'Éducation Physique',
        nameAr: 'الرياضة',
        color: '#EA580C',
        order: 14,
      },
      { slug: 'arts', nameFr: 'Arts Plastiques', nameAr: 'الفنون', color: '#DB2777', order: 15 },
      { slug: 'musique', nameFr: 'Musique', nameAr: 'الموسيقى', color: '#9333EA', order: 16 },
    ];
    const subjects = await Promise.all(subjectsData.map((s) => prisma.subject.create({ data: s })));

    // Users
    const passwordHash = await bcrypt.hash('demo1234', 10);

    const admin = await prisma.user.create({
      data: {
        email: 'admin@examanet.com',
        passwordHash,
        role: 'ADMIN',
        status: 'ACTIVE',
        emailVerifiedAt: new Date(),
        firstName: 'Admin',
        lastName: 'Principal',
        schoolName: 'Examanet',
        governorate: 'Tunis',
        slug: 'admin-principal',
      },
    });

    const teachersData = [
      {
        email: 'ahmed.benali@examanet.com',
        firstName: 'Ahmed',
        lastName: 'Ben Ali',
        subjects: ['mathematiques'],
        school: 'Lycée Bourguiba, Tunis',
      },
      {
        email: 'fatma.trabelsi@examanet.com',
        firstName: 'Fatma',
        lastName: 'Trabelsi',
        subjects: ['physique'],
        school: 'Lycée Carnot, Tunis',
      },
      {
        email: 'mohamed.gharbi@examanet.com',
        firstName: 'Mohamed',
        lastName: 'Gharbi',
        subjects: ['svt'],
        school: 'Collège Pilote, Sfax',
      },
      {
        email: 'leila.bouzid@examanet.com',
        firstName: 'Leila',
        lastName: 'Bouzid',
        subjects: ['francais', 'arabe'],
        school: 'Collège 7 Novembre, Sousse',
      },
      {
        email: 'karim.jendoubi@examanet.com',
        firstName: 'Karim',
        lastName: 'Jendoubi',
        subjects: ['anglais'],
        school: 'Lycée Technique, Monastir',
      },
      {
        email: 'sarra.mansouri@examanet.com',
        firstName: 'Sarra',
        lastName: 'Mansouri',
        subjects: ['philosophie', 'histoire'],
        school: 'Lycée Alaoui, Tunis',
      },
      {
        email: 'youssef.daoud@examanet.com',
        firstName: 'Youssef',
        lastName: 'Daoud',
        subjects: ['informatique', 'technologie'],
        school: 'Lycée Technique, Sfax',
      },
      {
        email: 'amina.khelifi@examanet.com',
        firstName: 'Amina',
        lastName: 'Khelifi',
        subjects: ['mathematiques', 'physique'],
        school: 'Collège Pilote, Nabeul',
      },
    ];
    const teachers = await Promise.all(
      teachersData.map((t) =>
        prisma.user.create({
          data: {
            email: t.email,
            passwordHash,
            role: 'TEACHER',
            status: 'ACTIVE',
            emailVerifiedAt: new Date(),
            isVerifiedTeacher: true,
            approvedAt: new Date(),
            approvedById: admin.id,
            firstName: t.firstName,
            lastName: t.lastName,
            schoolName: t.school,
            governorate: t.school.includes('Tunis')
              ? 'Tunis'
              : t.school.includes('Sfax')
                ? 'Sfax'
                : t.school.includes('Sousse')
                  ? 'Sousse'
                  : t.school.includes('Monastir')
                    ? 'Monastir'
                    : 'Nabeul',
            bio: "Professeur passionné avec plus de 10 ans d'expérience dans l'enseignement.",
            teachingSubjects: JSON.stringify(t.subjects),
            lastLoginAt: new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000),
            slug: '',
          },
        }),
      ),
    );

    const studentsData = [
      {
        firstName: 'Yassine',
        lastName: 'Hamdi',
        email: 'yassine@example.com',
        classLevel: '4eme-secondaire',
        section: 'sciences',
      },
      {
        firstName: 'Mariem',
        lastName: 'Baccouche',
        email: 'mariem@example.com',
        classLevel: '3eme-secondaire',
        section: 'maths',
      },
      {
        firstName: 'Ala',
        lastName: 'Ben Salah',
        email: 'ala@example.com',
        classLevel: '2eme-secondaire',
        section: 'sciences',
      },
      {
        firstName: 'Salma',
        lastName: 'Riahi',
        email: 'salma@example.com',
        classLevel: '1ere-secondaire',
        section: 'lettres',
      },
      { firstName: 'Hicham', lastName: 'Jouini', email: 'hicham@example.com', classLevel: '9eme' },
      { firstName: 'Nour', lastName: 'Mejri', email: 'nour@example.com', classLevel: '8eme' },
      { firstName: 'Ramy', lastName: 'Bouazizi', email: 'ramy@example.com', classLevel: '7eme' },
    ];
    const students = await Promise.all(
      studentsData.map((s) =>
        prisma.user.create({
          data: {
            email: s.email,
            passwordHash,
            role: 'STUDENT',
            status: 'ACTIVE',
            emailVerifiedAt: new Date(),
            firstName: s.firstName,
            lastName: s.lastName,
            schoolName: 'Lycée Pilote',
            classLevel: s.classLevel,
            section: s.section,
            governorate: 'Tunis',
            lastLoginAt: new Date(Date.now() - Math.random() * 3 * 24 * 60 * 60 * 1000),
            slug: '',
          },
        }),
      ),
    );

    // Resources
    const resourcesData = [
      {
        title: 'Devoir de synthèse n°3 — Mathématiques Bac 2024',
        desc: 'Devoir complet couvrant algèbre, analyse et probabilités.',
        type: 'DEVOIR',
        subject: 'mathematiques',
        class: '4eme-secondaire',
        section: 'sciences',
        teacherIdx: 0,
        trimester: '3',
        year: '2023-2024',
      },
      {
        title: 'Cours complet — Électricité et Magnétisme',
        desc: 'Cours détaillé avec illustrations, formules et exemples.',
        type: 'COURSE',
        subject: 'physique',
        class: '3eme-secondaire',
        section: 'sciences',
        teacherIdx: 1,
        trimester: '2',
        year: '2023-2024',
      },
      {
        title: 'Corrigé officiel — Bac Sciences 2024',
        desc: "Corrigé complet de l'épreuve de SVT du Baccalauréat 2024.",
        type: 'CORRECTION',
        subject: 'svt',
        class: '4eme-secondaire',
        section: 'sciences',
        teacherIdx: 2,
        trimester: '3',
        year: '2023-2024',
      },
      {
        title: "Série d'exercices — Production écrite",
        desc: '20 sujets de production écrite pour le Bac.',
        type: 'EXERCISE',
        subject: 'francais',
        class: '4eme-secondaire',
        section: 'lettres',
        teacherIdx: 3,
        trimester: '1',
        year: '2023-2024',
      },
      {
        title: 'English Bac Mock Exam 2024',
        desc: 'Full mock exam with listening, reading, writing.',
        type: 'EXAM',
        subject: 'anglais',
        class: '4eme-secondaire',
        section: 'sciences',
        teacherIdx: 4,
        trimester: '2',
        year: '2023-2024',
      },
      {
        title: 'Cours de Philosophie — La conscience',
        desc: 'Fiche de cours sur le thème de la conscience.',
        type: 'COURSE',
        subject: 'philosophie',
        class: '3eme-secondaire',
        section: 'lettres',
        teacherIdx: 5,
        trimester: '1',
        year: '2023-2024',
      },
      {
        title: 'Algorithmique et Python — TD1',
        desc: 'Travaux dirigés sur les bases de Python.',
        type: 'EXERCISE',
        subject: 'informatique',
        class: '2eme-secondaire',
        section: 'sciences',
        teacherIdx: 6,
        trimester: '1',
        year: '2023-2024',
      },
      {
        title: 'Devoir surveillé — Mathématiques 9ème',
        desc: 'DS complet pour la 9ème année de base.',
        type: 'EXAM',
        subject: 'mathematiques',
        class: '9eme',
        teacherIdx: 7,
        trimester: '2',
        year: '2023-2024',
      },
      {
        title: 'Fiche de révision — Bac Maths 2024',
        desc: 'Toutes les formules et théorèmes essentiels.',
        type: 'REVISION',
        subject: 'mathematiques',
        class: '4eme-secondaire',
        section: 'sciences',
        teacherIdx: 0,
        trimester: '3',
        year: '2023-2024',
      },
      {
        title: 'Sujet Bac — Physique 2023',
        desc: 'Sujet officiel du Bac Physique 2023 avec barème.',
        type: 'BAC_SUBJECT',
        subject: 'physique',
        class: '4eme-secondaire',
        section: 'sciences',
        teacherIdx: 1,
        trimester: '3',
        year: '2022-2023',
      },
      {
        title: 'Résumé — La cellule animale et végétale',
        desc: 'Résumé illustré du chapitre sur la cellule.',
        type: 'SUMMARY',
        subject: 'svt',
        class: '1ere-secondaire',
        section: 'sciences',
        teacherIdx: 2,
        trimester: '1',
        year: '2023-2024',
      },
      {
        title: 'Contrôle continu — Arabe 8ème',
        desc: "Contrôle de compréhension et d'expression écrite.",
        type: 'EXAM',
        subject: 'arabe',
        class: '8eme',
        teacherIdx: 3,
        trimester: '2',
        year: '2023-2024',
      },
      {
        title: 'Histoire — Le monde contemporain',
        desc: 'Cours complet sur le monde contemporain.',
        type: 'COURSE',
        subject: 'histoire',
        class: '3eme-secondaire',
        section: 'lettres',
        teacherIdx: 5,
        trimester: '2',
        year: '2023-2024',
      },
      {
        title: 'TD Algorithmique — Les boucles',
        desc: 'Exercices progressifs sur les structures itératives.',
        type: 'EXERCISE',
        subject: 'informatique',
        class: '1ere-secondaire',
        section: 'sciences',
        teacherIdx: 6,
        trimester: '2',
        year: '2023-2024',
      },
      {
        title: 'Devoir de maison — Physique 3ème',
        desc: "Devoir de maison sur l'optique géométrique.",
        type: 'DEVOIR',
        subject: 'physique',
        class: '3eme-secondaire',
        section: 'sciences',
        teacherIdx: 1,
        trimester: '1',
        year: '2023-2024',
      },
      {
        title: 'Sujets Bac — Maths 2020-2024',
        desc: 'Compilation des 5 dernières sessions du Bac Maths.',
        type: 'BAC_SUBJECT',
        subject: 'mathematiques',
        class: '4eme-secondaire',
        section: 'maths',
        teacherIdx: 0,
        trimester: '3',
        year: '2023-2024',
      },
      {
        title: 'Économie — Le marché et les prix',
        desc: 'Cours complet sur le mécanisme du marché.',
        type: 'COURSE',
        subject: 'economie',
        class: '3eme-secondaire',
        section: 'eco-gestion',
        teacherIdx: 5,
        trimester: '1',
        year: '2023-2024',
      },
      {
        title: 'Anglais — Grammar revision pack',
        desc: 'Pack de révision grammaticale pour Bac.',
        type: 'REVISION',
        subject: 'anglais',
        class: '4eme-secondaire',
        section: 'sciences',
        teacherIdx: 4,
        trimester: '2',
        year: '2023-2024',
      },
      {
        title: 'Technologie — Les réseaux informatiques',
        desc: 'Cours sur les réseaux LAN, WAN, Internet.',
        type: 'COURSE',
        subject: 'technologie',
        class: '2eme-secondaire',
        section: 'technique',
        teacherIdx: 6,
        trimester: '1',
        year: '2023-2024',
      },
      {
        title: 'Géographie — La mondialisation',
        desc: 'Fiche de cours complète sur la mondialisation.',
        type: 'SUMMARY',
        subject: 'geographie',
        class: '3eme-secondaire',
        section: 'eco-gestion',
        teacherIdx: 5,
        trimester: '2',
        year: '2023-2024',
      },
      {
        title: "Série d'exercices — SVT 1ère année",
        desc: '20 exercices sur la cellule, la reproduction.',
        type: 'EXERCISE',
        subject: 'svt',
        class: '1ere-secondaire',
        section: 'sciences',
        teacherIdx: 2,
        trimester: '1',
        year: '2023-2024',
      },
      {
        title: 'Bac Blanc — Mathématiques 2024',
        desc: 'Sujet de Bac blanc avec tous les thèmes.',
        type: 'EXAM',
        subject: 'mathematiques',
        class: '4eme-secondaire',
        section: 'sciences',
        teacherIdx: 0,
        trimester: '2',
        year: '2023-2024',
      },
      {
        title: 'Cours Arabe — النصوص الأدبية',
        desc: 'شرح مفصل للنصوص الأدبية المبرمجة.',
        type: 'COURSE',
        subject: 'arabe',
        class: '4eme-secondaire',
        section: 'lettres',
        teacherIdx: 3,
        trimester: '1',
        year: '2023-2024',
      },
      {
        title: 'Philosophie — La liberté',
        desc: 'Dissertation philosophique sur la liberté.',
        type: 'COURSE',
        subject: 'philosophie',
        class: '4eme-secondaire',
        section: 'lettres',
        teacherIdx: 5,
        trimester: '2',
        year: '2023-2024',
      },
    ];

    for (const r of resourcesData) {
      const subject = subjects.find((s) => s.slug === r.subject)!;
      const cls = classes.find((c) => c.slug === r.class)!;
      const section = r.section
        ? await prisma.section.findFirst({ where: { classId: cls.id, slug: r.section } })
        : null;
      const teacher = teachers[r.teacherIdx];

      const slug = r.title
        .toLowerCase()
        .replace(/[àáâãäå]/g, 'a')
        .replace(/[èéêë]/g, 'e')
        .replace(/[ìíîï]/g, 'i')
        .replace(/[òóôõö]/g, 'o')
        .replace(/[ùúûü]/g, 'u')
        .replace(/[ç]/g, 'c')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .substring(0, 80);

      const viewsCount = Math.floor(Math.random() * 5000) + 100;
      const downloadsCount = Math.floor(viewsCount * 0.4);
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
          viewsCount,
          downloadsCount,
          sharesCount: Math.floor(viewsCount * 0.05),
          favoritesCount: Math.floor(viewsCount * 0.08),
          commentsCount,
          avgRating,
          ratingCount,
          approvedAt: new Date(),
          approvedById: admin.id,
          publishedAt: new Date(),
        },
      });

      if (commentsCount > 0) {
        for (let i = 0; i < 3; i++) {
          const student = students[Math.floor(Math.random() * students.length)];
          await prisma.comment.create({
            data: {
              resourceId: resource.id,
              userId: student.id,
              content: [
                'Excellent document, merci beaucoup !',
                'Très utile pour mes révisions.',
                'Le corrigé est très détaillé.',
              ][i],
            },
          });
        }
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Seed completed!',
      counts: {
        users: await prisma.user.count(),
        resources: await prisma.resource.count(),
        subjects: await prisma.subject.count(),
        comments: await prisma.comment.count(),
      },
    });
  } catch (e: any) {
    console.error('Seed error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
