import fs from 'fs';
const fr = JSON.parse(fs.readFileSync('./src/messages/fr.json', 'utf8'));
const ar = JSON.parse(fs.readFileSync('./src/messages/ar.json', 'utf8'));

fr.contact.form.errorRequired = "Veuillez remplir tous les champs requis";
fr.contact.form.errorSend = "Erreur lors de l'envoi";
fr.contact.form.errorNetwork = "Erreur réseau";
fr.contact.form.success = "Message envoyé ! Nous vous répondrons rapidement.";
fr.contact.form.sentTitle = "Message envoyé !";
fr.contact.form.sentDesc = "Nous vous répondrons sous 24-48h ouvrés.";
fr.contact.form.name = "Nom complet";
fr.contact.form.namePlaceholder = "Votre nom";
fr.contact.form.email = "Email";
fr.contact.form.emailPlaceholder = "vous@exemple.com";
fr.contact.form.subject = "Sujet";
fr.contact.form.chooseSubject = "-- Choisir un sujet --";
fr.contact.form.subjects = {
  question: "Question générale",
  bug: "Signaler un bug",
  teacher: "Devenir enseignant",
  partnership: "Partenariat",
  copyright: "Droit d'auteur (DMCA)",
  other: "Autre",
};
fr.contact.form.message = "Message";
fr.contact.form.messagePlaceholder = "Décrivez votre demande en détail...";
fr.contact.form.rgpd = "RGPD";
fr.contact.form.rgpdText = "Vos données ne sont utilisées que pour vous répondre. Voir nos {cgu}.";
fr.contact.form.sending = "Envoi en cours...";
fr.contact.form.send = "Envoyer le message";

ar.contact.form.errorRequired = "يرجى ملء جميع الحقول المطلوبة";
ar.contact.form.errorSend = "خطأ أثناء الإرسال";
ar.contact.form.errorNetwork = "خطأ في الشبكة";
ar.contact.form.success = "تم إرسال الرسالة! سنرد عليك قريباً.";
ar.contact.form.sentTitle = "تم إرسال الرسالة!";
ar.contact.form.sentDesc = "سنرد عليك خلال 24-48 ساعة عمل.";
ar.contact.form.name = "الاسم الكامل";
ar.contact.form.namePlaceholder = "اسمك";
ar.contact.form.email = "البريد الإلكتروني";
ar.contact.form.emailPlaceholder = "you@example.com";
ar.contact.form.subject = "الموضوع";
ar.contact.form.chooseSubject = "-- اختر موضوعاً --";
ar.contact.form.subjects = {
  question: "سؤال عام",
  bug: "الإبلاغ عن خطأ",
  teacher: "أن أصبح معلماً",
  partnership: "شراكة",
  copyright: "حقوق النشر (DMCA)",
  other: "أخرى",
};
ar.contact.form.message = "الرسالة";
ar.contact.form.messagePlaceholder = "صف طلبك بالتفصيل...";
ar.contact.form.rgpd = "اللائحة العامة لحماية البيانات";
ar.contact.form.rgpdText = "بياناتك لن تُستخدم إلا للرد عليك. راجع {cgu}.";
ar.contact.form.sending = "جاري الإرسال...";
ar.contact.form.send = "إرسال الرسالة";

fs.writeFileSync('./src/messages/fr.json', JSON.stringify(fr, null, 2) + '\n');
fs.writeFileSync('./src/messages/ar.json', JSON.stringify(ar, null, 2) + '\n');
console.log('ContactForm keys added');
