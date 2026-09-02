import fs from 'fs';
const fr = JSON.parse(fs.readFileSync('./src/messages/fr.json', 'utf8'));
const ar = JSON.parse(fs.readFileSync('./src/messages/ar.json', 'utf8'));

// Check existing footer keys
console.log('Existing footer keys (FR):', Object.keys(fr.footer || {}));
console.log('Existing footer keys (AR):', Object.keys(ar.footer || {}));

// Add missing keys
fr.footer.sujetsBac = "Sujets Bac";
fr.footer.corriges = "Corrigés";

ar.footer.sujetsBac = "مواضيع الباكالوريا";
ar.footer.corriges = "الإصلاحات";

// Fix the typo: "كيف تبلاغ" → "كيف تبلغ"
ar.contact.faq.q1 = "كيف تبلّغ عن محتوى مسيء؟";
ar.contact.faq.a1 = "استخدم زر \"الإبلاغ\" على كل مورد أو النموذج أعلاه مع موضوع \"خطأ\".";

// Verify footer.madeWith exists in both
if (!fr.footer.madeWith) {
  fr.footer.madeWith = "Conçu avec ❤️ en Tunisie 🇹🇳 pour les élèves tunisiens";
}
if (!ar.footer.madeWith) {
  ar.footer.madeWith = "صُنع بـ ❤️ في تونس 🇹🇳 للتلاميذ التونسيين";
}
if (!fr.footer.copyright) {
  fr.footer.copyright = "© {year} Examanet. Tous droits réservés.";
}
if (!ar.footer.copyright) {
  ar.footer.copyright = "© {year} إكسامانت. جميع الحقوق محفوظة.";
}
if (!fr.footer.navigation) {
  fr.footer.navigation = "Navigation";
}
if (!ar.footer.navigation) {
  ar.footer.navigation = "التنقل";
}
if (!fr.footer.resources) {
  fr.footer.resources = "Ressources";
}
if (!ar.footer.resources) {
  ar.footer.resources = "الموارد";
}
if (!fr.footer.referentiel) {
  fr.footer.referentiel = "Référentiel national";
}
if (!ar.footer.referentiel) {
  ar.footer.referentiel = "المرجع الوطني";
}
if (!fr.footer.about) {
  fr.footer.about = "À propos";
}
if (!ar.footer.about) {
  ar.footer.about = "حول";
}

fs.writeFileSync('./src/messages/fr.json', JSON.stringify(fr, null, 2) + '\n');
fs.writeFileSync('./src/messages/ar.json', JSON.stringify(ar, null, 2) + '\n');
console.log('Footer keys + typo fix applied');
