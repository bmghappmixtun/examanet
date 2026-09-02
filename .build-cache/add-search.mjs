import fs from 'fs';
const fr = JSON.parse(fs.readFileSync('./src/messages/fr.json', 'utf8'));
const ar = JSON.parse(fs.readFileSync('./src/messages/ar.json', 'utf8'));

fr.search.recentSearches = "Recherches récentes";
fr.search.clear = "Effacer";

ar.search.recentSearches = "عمليات البحث الأخيرة";
ar.search.clear = "مسح";

fs.writeFileSync('./src/messages/fr.json', JSON.stringify(fr, null, 2) + '\n');
fs.writeFileSync('./src/messages/ar.json', JSON.stringify(ar, null, 2) + '\n');
console.log('search keys added');
