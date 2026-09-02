import fs from 'fs';
const fr = JSON.parse(fs.readFileSync('./src/messages/fr.json', 'utf8'));
const ar = JSON.parse(fs.readFileSync('./src/messages/ar.json', 'utf8'));

fr.levels = {
  hero: {
    h1a: "Tous les ",
    h1b: "niveaux scolaires",
    h1c: "",
    subtitle: "Notre plateforme couvre les classes à partir de la 7ème année de base jusqu'au Baccalauréat. Retrouvez les ressources conformes au programme officiel du Ministère de l'Éducation tunisien : cours, devoirs, exercices, corrigés et sujets BAC — organisés par cycle et par classe.",
    cycles: "cycles",
    classes: "classes",
    ressources: "ressources",
    gratuit: "100% gratuit",
  },
  richSnippet: "Explorez les ressources pédagogiques gratuites par niveau et classe (Enseignement de base et Enseignement Secondaire).",
};

ar.levels = {
  hero: {
    h1a: "جميع ",
    h1b: "المستويات الدراسية",
    h1c: "",
    subtitle: "منصتنا تغطي الأقسام من السنة السابعة أساسي إلى الباكالوريا. اعثر على الموارد المتوافقة مع البرنامج الرسمي لوزارة التربية التونسية: دروس، فروض، تمارين، إصلاحات ومواضيع باكالوريا — منظمة حسب الحلقة والقسم.",
    cycles: "حلقات",
    classes: "أقسام",
    ressources: "موارد",
    gratuit: "100% مجاني",
  },
  richSnippet: "استكشف الموارد التربوية المجانية حسب المستوى والقسم (التعليم الأساسي والتعليم الثانوي).",
};

fs.writeFileSync('./src/messages/fr.json', JSON.stringify(fr, null, 2) + '\n');
fs.writeFileSync('./src/messages/ar.json', JSON.stringify(ar, null, 2) + '\n');
console.log('levels added');
