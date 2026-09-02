import fs from 'fs';
const fr = JSON.parse(fs.readFileSync('./src/messages/fr.json', 'utf8'));
const ar = JSON.parse(fs.readFileSync('./src/messages/ar.json', 'utf8'));

fr.levels.parcours = {
  title: "Votre parcours de la 7ème au Bac",
  subtitle: "Sept années d'apprentissage — chaque étape ouvre de nouvelles matières",
};
fr.levels.cta = {
  title: "Préparez votre réussite scolaire",
  subtitle: "Toutes les ressources sont conformes au programme officiel tunisien et sélectionnées par nos professeurs partenaires.",
  cta1: "Toutes les ressources",
  cta2: "🇹🇳 Référentiel national",
};

ar.levels.parcours = {
  title: "مسيرتك من السابعة إلى الباكالوريا",
  subtitle: "سبع سنوات من التعلم — كل مرحلة تفتح مواد جديدة",
};
ar.levels.cta = {
  title: "حقق نجاحك الدراسي",
  subtitle: "جميع الموارد متوافقة مع البرنامج الرسمي التونسي ومختارة من قبل أساتذتنا الشركاء.",
  cta1: "جميع الموارد",
  cta2: "🇹🇳 المرجع الوطني",
};

fs.writeFileSync('./src/messages/fr.json', JSON.stringify(fr, null, 2) + '\n');
fs.writeFileSync('./src/messages/ar.json', JSON.stringify(ar, null, 2) + '\n');
console.log('levels parcours/cta added');
