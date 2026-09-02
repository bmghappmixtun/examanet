import fs from 'fs';
const fr = JSON.parse(fs.readFileSync('./src/messages/fr.json', 'utf8'));
const ar = JSON.parse(fs.readFileSync('./src/messages/ar.json', 'utf8'));

fr.teacher.filteredResults = "Professeurs filtrés — Examanet";
fr.teacher.allResults = "Tous les enseignants — Examanet";
fr.teacher.richSnippet = "Découvrez {count} enseignants tunisiens sur Examanet";
fr.teacher.atSchool = "Enseignant à {school}";
fr.teacher.onExamanet = "Enseignant sur Examanet";

ar.teacher.filteredResults = "المعلمون المفلترون — إكسامانت";
ar.teacher.allResults = "جميع المعلمين — إكسامانت";
ar.teacher.richSnippet = "اكتشف {count} معلماً تونسياً على إكسامانت";
ar.teacher.atSchool = "معلم في {school}";
ar.teacher.onExamanet = "معلم على إكسامانت";

fs.writeFileSync('./src/messages/fr.json', JSON.stringify(fr, null, 2) + '\n');
fs.writeFileSync('./src/messages/ar.json', JSON.stringify(ar, null, 2) + '\n');
console.log('teacher group updated');
