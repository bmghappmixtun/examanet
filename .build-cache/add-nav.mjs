import fs from 'fs';
const fr = JSON.parse(fs.readFileSync('./src/messages/fr.json', 'utf8'));
const ar = JSON.parse(fs.readFileSync('./src/messages/ar.json', 'utf8'));

// Add missing nav keys
fr.nav.college = "Collège";
fr.nav.concours = "Concours 9ème";
fr.nav.myAccount = "Mon compte";
fr.nav.about = "À propos";
fr.nav.contact = "Contact";

ar.nav.college = "الإعدادي";
ar.nav.concours = "مناظرة التاسعة";
ar.nav.myAccount = "حسابي";
ar.nav.about = "حول";
ar.nav.contact = "اتصال";

fs.writeFileSync('./src/messages/fr.json', JSON.stringify(fr, null, 2) + '\n');
fs.writeFileSync('./src/messages/ar.json', JSON.stringify(ar, null, 2) + '\n');
console.log('nav keys added');
