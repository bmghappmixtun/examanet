import fs from 'fs';
const fr = JSON.parse(fs.readFileSync('./src/messages/fr.json', 'utf8'));
const ar = JSON.parse(fs.readFileSync('./src/messages/ar.json', 'utf8'));

fr.subjects = fr.subjects || {};
fr.subjects.page = {
  hero: {
    h1a: "Toutes les ",
    h1b: "matières",
    h1c: "",
    subtitle: "Explorez {count} matières du système éducatif tunisien — de la 7ème de base jusqu'au Baccalauréat. Cours, devoirs, séries, sujets BAC et corrigés gratuits, conformes au programme officiel.",
    matieres: "matières",
    ressources: "ressources",
    gratuit: "100% gratuit",
  },
  richSnippet: "${count} matières disponibles : cours, devoirs, exercices et corrigés gratuits pour le système éducatif tunisien.",
  richSnippetItem: "${count} ressources en ${name}",
};

ar.subjects = ar.subjects || {};
ar.subjects.page = {
  hero: {
    h1a: "جميع ",
    h1b: "المواد",
    h1c: "",
    subtitle: "استكشف {count} مادة من النظام التربوي التونسي — من السنة السابعة أساسي إلى الباكالوريا. دروس، فروض، سلاسل، مواضيع باكالوريا وإصلاحات مجانية، متوافقة مع البرنامج الرسمي.",
    matieres: "مواد",
    ressources: "موارد",
    gratuit: "100% مجاني",
  },
  richSnippet: "{count} مادة متاحة: دروس، فروض، تمارين وإصلاحات مجانية للنظام التربوي التونسي.",
  richSnippetItem: "{count} مورد في {name}",
};

fs.writeFileSync('./src/messages/fr.json', JSON.stringify(fr, null, 2) + '\n');
fs.writeFileSync('./src/messages/ar.json', JSON.stringify(ar, null, 2) + '\n');
console.log('subjects.page added');
