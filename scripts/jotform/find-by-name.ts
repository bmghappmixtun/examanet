#!/usr/bin/env -S npx tsx
// Find JotForm submissions matching a teacher name
// Usage: tsx scripts/jotform/find-by-name.ts "Gharbi Ridha"

const API_KEY = process.env.JOTFORM_API_KEY;
if (!API_KEY) { console.error('JOTFORM_API_KEY env var required'); process.exit(1); }

const BASE = 'https://eu-api.jotform.com';
const searchName = process.argv[2]?.toLowerCase();
if (!searchName) { console.error('Usage: tsx find-by-name.ts "Gharbi Ridha"'); process.exit(1); }

const FORMS = [
  { id: '241023983108957', name: 'Primaireprivee.tn' },
  { id: '231496701948061', name: 'Quelle est votre fichier ?' },
  { id: '13465948895', name: 'Tunisiecollege.net Arabe' },
  { id: '2880314284', name: 'Devoirat.net' },
  { id: '10623304649', name: 'Tunisiecollege.net' },
];

(async () => {
  console.log(`Searching for "${searchName}" across all forms...\n`);
  const matches: any[] = [];

  for (const form of FORMS) {
    let offset = 0;
    const limit = 1000;
    while (true) {
      const res = await fetch(`${BASE}/form/${form.id}/submissions?apiKey=${API_KEY}&limit=${limit}&offset=${offset}`);
      const data: any = await res.json();
      if (data.responseCode !== 200) break;

      const subs = data.content || [];
      for (const sub of subs) {
        const ans = sub.answers || {};
        // Concatenate all answer text for searching
        const allText = Object.values(ans).map((a: any) => {
          const name = a.name || '';
          const answer = typeof a.answer === 'string' ? a.answer : JSON.stringify(a.answer || '');
          return `${name} ${answer}`;
        }).join(' ').toLowerCase();

        if (allText.includes(searchName)) {
          matches.push({ form, sub, ans });
        }
      }
      if (subs.length < limit) break;
      offset += limit;
    }
  }

  console.log(`Found ${matches.length} matching submissions:\n`);
  for (const m of matches) {
    const ans = m.ans;
    const emailKey = Object.keys(ans).find(k => /email/i.test(ans[k].name || ''));
    const nameKey = Object.keys(ans).find(k => /nom|name|full/i.test(ans[k].name || ''));
    const fileKey = Object.keys(ans).find(k => ans[k].type === 'control_fileupload' || /file|fichier/i.test(ans[k].name || ''));

    const email = emailKey ? ans[emailKey].answer : '-';
    const name = nameKey ? (typeof ans[nameKey].answer === 'string' ? ans[nameKey].answer : JSON.stringify(ans[nameKey].answer)) : '-';

    let fileCount = 0;
    let fileNames: string[] = [];
    if (fileKey && ans[fileKey].answer) {
      const a = ans[fileKey].answer;
      if (typeof a === 'string') {
        const urlMatches = a.match(/https?:\/\/[^\s"]+/g);
        if (urlMatches) {
          fileCount = urlMatches.length;
          fileNames = urlMatches.map((u: string) => u.split('/').pop() || '');
        }
      } else if (Array.isArray(a)) {
        fileCount = a.length;
        fileNames = a.map((u: string) => u.split('/').pop() || '');
      }
    }

    console.log(`Form: ${m.form.name} (${m.form.id})`);
    console.log(`ID: ${m.sub.id} | ${new Date(m.sub.created_at).toISOString().slice(0, 10)} | ${m.sub.status}`);
    console.log(`  Name:  ${name}`);
    console.log(`  Email: ${email}`);
    console.log(`  Files (${fileCount}):`);
    for (const fn of fileNames.slice(0, 10)) console.log(`    - ${fn}`);
    if (fileNames.length > 10) console.log(`    ... +${fileNames.length - 10} more`);
    console.log();
  }
})();
