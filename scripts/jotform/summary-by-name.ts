#!/usr/bin/env -S npx tsx
// Generate a summary of all matching submissions for a teacher
import * as fs from 'fs';

const API_KEY = process.env.JOTFORM_API_KEY;
if (!API_KEY) { console.error('JOTFORM_API_KEY env var required'); process.exit(1); }

const BASE = 'https://eu-api.jotform.com';
const searchName = process.argv[2]?.toLowerCase();
if (!searchName) { console.error('Usage: tsx summary-by-name.ts "Gharbi Ridha"'); process.exit(1); }

const FORMS = [
  { id: '241023983108957', name: 'Primaireprivee.tn' },
  { id: '231496701948061', name: 'Quelle est votre fichier ?' },
  { id: '13465948895', name: 'Tunisiecollege.net Arabe' },
  { id: '2880314284', name: 'Devoirat.net' },
  { id: '10623304649', name: 'Tunisiecollege.net' },
];

(async () => {
  const all: any[] = [];
  const seen = new Set<string>();

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
        const allText = Object.values(ans).map((a: any) => {
          const name = a.name || '';
          const answer = typeof a.answer === 'string' ? a.answer : JSON.stringify(a.answer || '');
          return `${name} ${answer}`;
        }).join(' ').toLowerCase();

        if (allText.includes(searchName) && !seen.has(sub.id)) {
          seen.add(sub.id);

          // Extract email, name, files
          const emailKey = Object.keys(ans).find(k => /email/i.test(ans[k].name || ''));
          const nameKey = Object.keys(ans).find(k => /nom|name|full/i.test(ans[k].name || ''));
          const fileKey = Object.keys(ans).find(k => ans[k].type === 'control_fileupload' || /file|fichier/i.test(ans[k].name || ''));

          const email = emailKey ? ans[emailKey].answer : null;
          const name = nameKey ? (typeof ans[nameKey].answer === 'string' ? ans[nameKey].answer : null) : null;

          let files: { url: string; name: string }[] = [];
          if (fileKey && ans[fileKey].answer) {
            const a = ans[fileKey].answer;
            let urls: string[] = [];
            if (typeof a === 'string') {
              const urlMatches = a.match(/https?:\/\/[^\s"]+/g);
              if (urlMatches) urls = urlMatches;
            } else if (Array.isArray(a)) {
              urls = a;
            } else if (typeof a === 'object') {
              urls = Object.keys(a).filter(k => k.startsWith('http'));
            }
            files = urls.map((u: string) => ({
              url: u,
              name: decodeURIComponent(u.split('/').pop() || 'file')
            }));
          }

          all.push({
            submissionId: sub.id,
            formId: form.id,
            formName: form.name,
            createdAt: sub.created_at,
            teacherName: name,
            teacherEmail: email,
            fileCount: files.length,
            files,
          });
        }
      }
      if (subs.length < limit) break;
      offset += limit;
    }
  }

  // Group by email
  const byEmail: Record<string, any[]> = {};
  for (const sub of all) {
    const key = sub.teacherEmail || 'NO_EMAIL';
    if (!byEmail[key]) byEmail[key] = [];
    byEmail[key].push(sub);
  }

  console.log(`\n=== SUMMARY: ${searchName} ===\n`);
  console.log(`Total matching submissions: ${all.length}`);
  console.log(`Total files: ${all.reduce((s, x) => s + x.fileCount, 0)}`);
  console.log(`Unique emails: ${Object.keys(byEmail).length}\n`);

  for (const [email, subs] of Object.entries(byEmail)) {
    const totalFiles = subs.reduce((s, x) => s + x.fileCount, 0);
    console.log(`EMAIL: ${email}`);
    console.log(`  Submissions: ${subs.length}, Files: ${totalFiles}`);
    if (subs[0].teacherName) console.log(`  Teacher name from form: ${subs[0].teacherName}`);
    const years: Record<string, number> = {};
    for (const s of subs) {
      const y = new Date(s.createdAt).getFullYear().toString();
      years[y] = (years[y] || 0) + 1;
    }
    console.log(`  By year:`, years);

    const byForm: Record<string, number> = {};
    for (const s of subs) byForm[s.formName] = (byForm[s.formName] || 0) + 1;
    console.log(`  By form:`, byForm);
    console.log();
  }

  // Save full data to JSON for later use
  fs.writeFileSync(`/tmp/jotform-${searchName.replace(/\s+/g, '-')}.json`, JSON.stringify(all, null, 2));
  console.log(`Full data saved to /tmp/jotform-${searchName.replace(/\s+/g, '-')}.json`);
})();
