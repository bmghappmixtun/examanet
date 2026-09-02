import fs from 'fs';
const fr = JSON.parse(fs.readFileSync('./src/messages/fr.json', 'utf8'));
const ar = JSON.parse(fs.readFileSync('./src/messages/ar.json', 'utf8'));

fr.faq = {
  hero: {
    title: "Questions fréquentes",
    subtitle: "Toutes les réponses à vos questions sur Examanet",
  },
  contact: {
    title: "Vous ne trouvez pas votre réponse ?",
    subtitle: "Notre équipe est là pour vous aider.",
    cta: "Nous contacter →",
  },
  sections: [
    {
      category: 'Général',
      questions: [
        {
          q: "Qu'est-ce qu'Examanet ?",
          a: "Examanet est la plateforme pédagogique gratuite #1 en Tunisie. Elle regroupe des cours, devoirs, séries d'exercices, sujets Bac et corrigés pour les élèves du collège (7ème, 8ème, 9ème année de base) et du lycée (1ère, 2ème, 3ème, 4ème année secondaire / Bac). Toutes les ressources sont 100% gratuites et accessibles sans inscription.",
        },
        {
          q: "Examanet est-il vraiment gratuit ?",
          a: "Oui, 100% gratuit. Aucune inscription n'est requise pour consulter, télécharger ou imprimer les ressources. Le site est soutenu par la communauté enseignante tunisienne.",
        },
        {
          q: "Quelles sont les matières disponibles ?",
          a: "Mathématiques, Physique, Sciences de la Vie et de la Terre (SVT), Français, Arabe, Anglais, Histoire-Géographie, Philosophie, Économie, Gestion, Informatique, Technologie, et plus encore.",
        },
        {
          q: "Examanet couvre-t-il tout le programme officiel tunisien ?",
          a: "Oui, les ressources suivent le programme officiel du Ministère de l'Éducation tunisien pour chaque niveau et chaque matière.",
        },
      ],
    },
    {
      category: 'Navigation & Téléchargement',
      questions: [
        {
          q: "Comment trouver une ressource précise ?",
          a: "Utilisez la barre de recherche en haut de la page, ou naviguez par niveau (Enseignement de base / Enseignement Secondaire), par classe (7ème, 8ème, 9ème, etc.) ou par matière. Vous pouvez aussi filtrer par type (Cours, Devoir, Série, Sujet Bac, Corrigé).",
        },
        {
          q: "Comment télécharger un PDF ?",
          a: "Sur la page d'une ressource, cliquez sur le bouton 'Télécharger' (icône en bas de page). Le PDF s'ouvre dans un nouvel onglet — vous pouvez ensuite l'enregistrer ou l'imprimer.",
        },
        {
          q: "Puis-je imprimer les ressources ?",
          a: "Oui, toutes les ressources sont au format PDF et peuvent être imprimées librement pour un usage personnel ou scolaire.",
        },
      ],
    },
    {
      category: 'Niveaux & Classes',
      questions: [
        {
          q: "Quelle est la différence entre 'Classe' et 'Niveau' ?",
          a: "La 'Classe' indique l'année précise (ex: 9ème année de base, 2ème année secondaire). Le 'Niveau' (ou cycle) indique le type d'enseignement : 'Enseignement de base' pour le collège (7-8-9ème) ou 'Enseignement Secondaire' pour le lycée (1-4ème année, Bac).",
        },
        {
          q: "Qu'est-ce que l'Enseignement de base ?",
          a: "L'Enseignement de base en Tunisie correspond au collège (7ème, 8ème, 9ème année). C'est le premier cycle du secondaire, après l'école primaire.",
        },
        {
          q: "Qu'est-ce que l'Enseignement Secondaire ?",
          a: "L'Enseignement Secondaire en Tunisie correspond au lycée (1ère, 2ème, 3ème, 4ème année secondaire). La 4ème année est l'année du Baccalauréat.",
        },
      ],
    },
    {
      category: 'Enseignants',
      questions: [
        {
          q: "Comment devenir contributeur sur Examanet ?",
          a: "Si vous êtes enseignant et souhaitez partager vos ressources, créez un compte enseignant gratuit sur examanet.com, puis ajoutez vos cours/devoirs depuis votre espace personnel.",
        },
        {
          q: "Comment contacter un enseignant ?",
          a: "Sur la page profil d'un enseignant (cliquez sur son nom), vous pouvez le suivre ou lui envoyer un message privé via la plateforme.",
        },
      ],
    },
    {
      category: 'Technique',
      questions: [
        {
          q: "Le site ne s'affiche pas correctement, que faire ?",
          a: "Essayez de vider le cache de votre navigateur (Ctrl+Shift+R ou Cmd+Shift+R). Si le problème persiste, contactez-nous via la page Contact.",
        },
        {
          q: "Puis-je utiliser Examanet sur mobile ?",
          a: "Oui, le site est entièrement responsive et optimisé pour mobile et tablette. Vous pouvez aussi l'installer comme une application (PWA) depuis votre navigateur.",
        },
      ],
    },
  ],
};

ar.faq = {
  hero: {
    title: "الأسئلة الشائعة",
    subtitle: "جميع الإجابات على أسئلتك حول إكسامانت",
  },
  contact: {
    title: "لم تجد إجابتك؟",
    subtitle: "فريقنا هنا لمساعدتك.",
    cta: "اتصل بنا ←",
  },
  sections: [
    {
      category: 'عام',
      questions: [
        {
          q: "ما هي إكسامانت؟",
          a: "إكسامانت هي المنصة التربوية المجانية #1 في تونس. تجمع دروس وفروض وسلاسل تمارين ومواضيع باك وإصلاحات لتلاميذ الإعدادي (السنة السابعة والثامنة والتاسعة أساسي) والثانوي (الأولى، الثانية، الثالثة، الرابعة ثانوي / باك). جميع الموارد مجانية 100% ويمكن الوصول إليها دون تسجيل.",
        },
        {
          q: "هل إكسامانت مجانية فعلاً؟",
          a: "نعم، مجانية 100%. لا حاجة لأي تسجيل للتصفح أو التحميل أو الطباعة. المنصة مدعومة من المجتمع التربوي التونسي.",
        },
        {
          q: "ما هي المواد المتاحة؟",
          a: "الرياضيات، الفيزياء، علوم الحياة والأرض، الفرنسية، العربية، الإنجليزية، التاريخ والجغرافيا، الفلسفة، الاقتصاد، التصرف، الإعلامية، التكنولوجيا، والمزيد.",
        },
        {
          q: "هل تغطي إكسامانت كل البرنامج الرسمي التونسي؟",
          a: "نعم، الموارد تتبع البرنامج الرسمي لوزارة التربية التونسية لكل مستوى وكل مادة.",
        },
      ],
    },
    {
      category: 'التنقل والتحميل',
      questions: [
        {
          q: "كيف أبحث عن مورد محدد؟",
          a: "استخدم شريط البحث في أعلى الصفحة، أو تصفح حسب المستوى (التعليم الأساسي / التعليم الثانوي) أو القسم (7، 8، 9، إلخ) أو المادة. يمكنك أيضاً التصفية حسب النوع (درس، فرض، سلسلة، موضوع باك، إصلاح).",
        },
        {
          q: "كيف أحمل ملف PDF؟",
          a: "في صفحة المورد، انقر على زر 'تحميل' (الأيقونة في أسفل الصفحة). يفتح الـ PDF في تبويب جديد — يمكنك بعد ذلك حفظه أو طباعته.",
        },
        {
          q: "هل يمكنني طباعة الموارد؟",
          a: "نعم، جميع الموارد بصيغة PDF ويمكن طباعتها بحرية للاستخدام الشخصي أو المدرسي.",
        },
      ],
    },
    {
      category: 'المستويات والأقسام',
      questions: [
        {
          q: "ما الفرق بين 'القسم' و'المستوى'؟",
          a: "'القسم' يحدد السنة بدقة (مثال: السنة التاسعة أساسي، الثانية ثانوي). 'المستوى' (أو الحلقة) يحدد نوع التعليم: 'التعليم الأساسي' للإعدادي (7-8-9) أو 'التعليم الثانوي' للثانوي (1-4، باكالوريا).",
        },
        {
          q: "ما هو التعليم الأساسي؟",
          a: "التعليم الأساسي في تونس يقابل الإعدادي (السنة السابعة والثامنة والتاسعة). وهي الحلقة الأولى من الثانوي، بعد المدرسة الابتدائية.",
        },
        {
          q: "ما هو التعليم الثانوي؟",
          a: "التعليم الثانوي في تونس يقابل الثانوية (الأولى، الثانية، الثالثة، الرابعة ثانوي). السنة الرابعة هي سنة الباكالوريا.",
        },
      ],
    },
    {
      category: 'المعلمون',
      questions: [
        {
          q: "كيف أصبح مساهماً في إكسامانت؟",
          a: "إذا كنت معلماً وترغب في مشاركة مواردك، أنشئ حساب معلم مجاني على examanet.com، ثم أضف دروسك/فروضك من فضائك الشخصي.",
        },
        {
          q: "كيف أتصل بمعلم؟",
          a: "في صفحة بروفايل المعلم (انقر على اسمه)، يمكنك متابعته أو إرسال رسالة خاصة عبر المنصة.",
        },
      ],
    },
    {
      category: 'تقني',
      questions: [
        {
          q: "الموقع لا يظهر بشكل صحيح، ماذا أفعل؟",
          a: "حاول إفراغ ذاكرة التخزين المؤقت للمتصفح (Ctrl+Shift+R أو Cmd+Shift+R). إذا استمرت المشكلة، اتصل بنا عبر صفحة الاتصال.",
        },
        {
          q: "هل يمكنني استخدام إكسامانت على الهاتف؟",
          a: "نعم، الموقع متجاوب بالكامل ومحسن للهاتف واللوحة. يمكنك أيضاً تثبيته كتطبيق (PWA) من متصفحك.",
        },
      ],
    },
  ],
};

fs.writeFileSync('./src/messages/fr.json', JSON.stringify(fr, null, 2) + '\n');
fs.writeFileSync('./src/messages/ar.json', JSON.stringify(ar, null, 2) + '\n');
console.log('FAQ added with', fr.faq.sections.length, 'sections');
