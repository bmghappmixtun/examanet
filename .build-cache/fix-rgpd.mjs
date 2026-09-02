import fs from 'fs';
const fr = JSON.parse(fs.readFileSync('./src/messages/fr.json', 'utf8'));
const ar = JSON.parse(fs.readFileSync('./src/messages/ar.json', 'utf8'));

// Remove {cgu} placeholder since we hardcode the link in JSX
fr.contact.form.rgpdText = "Vos données ne sont utilisées que pour vous répondre. Voir nos";
ar.contact.form.rgpdText = "بياناتك لن تُستخدم إلا للرد عليك. راجع";

fs.writeFileSync('./src/messages/fr.json', JSON.stringify(fr, null, 2) + '\n');
fs.writeFileSync('./src/messages/ar.json', JSON.stringify(ar, null, 2) + '\n');
console.log('rgpdText updated');
