import fs from 'fs';
const fr = JSON.parse(fs.readFileSync('./src/messages/fr.json', 'utf8'));
const ar = JSON.parse(fs.readFileSync('./src/messages/ar.json', 'utf8'));

// Home: 3 cards = Collège + Lycée (1AS-2AS) + Bac (3AS-4AS)
// No Primaire (not in Tunisian system)
fr.levels.college = "Collège";
fr.levels.collegeDesc = "7ème → 9ème année de base";
fr.levels.lycee = "Lycée";
fr.levels.lyceeDesc = "1ère → 2ème année secondaire";
fr.levels.bac = "Bac";
fr.levels.bacDesc = "3ème → 4ème année (Bac) — 7 sections";
fr.levels.exploreLevel = "Explorer ce niveau";

ar.levels.college = "الإعدادي";
ar.levels.collegeDesc = "السنة السابعة → التاسعة أساسي";
ar.levels.lycee = "الثانوي";
ar.levels.lyceeDesc = "الأولى → الثانية ثانوي";
ar.levels.bac = "الباكالوريا";
ar.levels.bacDesc = "الثالثة → الرابعة (باكالوريا) — 7 شعب";
ar.levels.exploreLevel = "استكشف هذا المستوى";

fs.writeFileSync('./src/messages/fr.json', JSON.stringify(fr, null, 2) + '\n');
fs.writeFileSync('./src/messages/ar.json', JSON.stringify(ar, null, 2) + '\n');
console.log('Home levels keys added (3 cards: Collège / Lycée / Bac)');
