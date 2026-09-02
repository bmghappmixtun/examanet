import fs from 'fs';
const fr = JSON.parse(fs.readFileSync('./src/messages/fr.json', 'utf8'));
const ar = JSON.parse(fs.readFileSync('./src/messages/ar.json', 'utf8'));

// Add to existing college group
fr.college.classes = {
  title: "Choisis ta classe",
  subtitle: "Chaque classe a son programme spécifique — clique sur la tienne pour accéder aux ressources.",
  desc7: "Première année du collège. Adaptation, nouvelles matières, méthodes de travail.",
  desc8: "Approfondissement. Préparation progressive aux évaluations nationales.",
  desc9: "Année charnière. Préparation intensive au passage vers le lycée.",
  ressources: "ressources",
  prepConcours: "🎯 Préparation concours",
  concoursTitle: "Concours 9ème 2027",
};
fr.college.subjects = {
  title: "Toutes les matières",
  subtitle: "Du tronc commun aux options, retrouve toutes les matières du collège.",
};
fr.college.top = {
  title: "Top ressources du collège",
  subtitle: "Les ressources les plus consultées par les élèves et les enseignants tunisiens.",
};
fr.college.cta = {
  title: "Prêt à réussir ton année ?",
  subtitle: "Rejoins les milliers d'élèves tunisiens qui utilisent Examanet pour réviser efficacement.",
  cta1: "Explorer les ressources",
  cta2: "Toutes les matières",
};

ar.college.classes = {
  title: "اختر قسمك",
  subtitle: "كل قسم له برنامج محدد — انقر على قسمك للوصول إلى الموارد.",
  desc7: "السنة الأولى من الإعدادي. تأقلم، مواد جديدة، طرق عمل.",
  desc8: "تعميق. تحضير تدريجي للتقييمات الوطنية.",
  desc9: "سنة محورية. تحضير مكثف للانتقال إلى الثانوية.",
  ressources: "مورد",
  prepConcours: "🎯 التحضير للمناظرة",
  concoursTitle: "مناظرة التاسعة 2027",
};
ar.college.subjects = {
  title: "جميع المواد",
  subtitle: "من الجذع المشترك إلى الخيارات، اعثر على جميع مواد الإعدادي.",
};
ar.college.top = {
  title: "أهم موارد الإعدادي",
  subtitle: "الموارد الأكثر استشارة من قبل التلاميذ والمعلمين التونسيين.",
};
ar.college.cta = {
  title: "هل أنت مستعد للنجاح في سنتك؟",
  subtitle: "انضم إلى آلاف التلاميذ التونسيين الذين يستخدمون إكسامانت للمراجعة الفعالة.",
  cta1: "استكشف الموارد",
  cta2: "جميع المواد",
};

fs.writeFileSync('./src/messages/fr.json', JSON.stringify(fr, null, 2) + '\n');
fs.writeFileSync('./src/messages/ar.json', JSON.stringify(ar, null, 2) + '\n');
console.log('college sections added');
