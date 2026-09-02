#!/usr/bin/env -S npx tsx
// List JotForm submissions for a given form ID
// Usage: tsx scripts/jotform/list-submissions.ts <formId> [--limit=N]

const API_KEY = process.env.JOTFORM_API_KEY;
if (!API_KEY) {
  console.error('JOTFORM_API_KEY env var required');
  process.exit(1);
}

const BASE = 'https://eu-api.jotform.com';
const formId = process.argv[2];
const limitArg = process.argv.find(a => a.startsWith('--limit='));
const limit = limitArg ? parseInt(limitArg.split('=')[1]) : 100;

if (!formId) {
  console.error('Usage: tsx list-submissions.ts <formId> [--limit=N]');
  process.exit(1);
}

(async () => {
  console.log(`Fetching submissions for form ${formId} (limit=${limit})...`);
  const res = await fetch(`${BASE}/form/${formId}/submissions?apiKey=${API_KEY}&limit=${limit}`);
  const data: any = await res.json();
  if (data.responseCode !== 200) { console.error('API error:', data.message); process.exit(1); }

  const subs = data.content;
  console.log(`Total: ${subs.length}\n`);

  for (const sub of subs.slice(0, 20)) {
    const ans = sub.answers || {};
    const emailKey = Object.keys(ans).find(k => /email/i.test(ans[k].name || '') || ans[k].type === 'control_email');
    const nameKey = Object.keys(ans).find(k => /nom|name|full/i.test(ans[k].name || '') || ans[k].type === 'control_fullname');
    const fileKey = Object.keys(ans).find(k => ans[k].type === 'control_fileupload' || /file|fichier/i.test(ans[k].name || ''));

    const email = emailKey ? ans[emailKey].answer : '-';
    const name = nameKey ? ans[nameKey].answer : '-';

    let files: string[] = [];
    if (fileKey && ans[fileKey].answer) {
      const a = ans[fileKey].answer;
      // JotForm file answers can be a string of URLs separated by \n or a complex format
      if (typeof a === 'string') {
        // Try to extract URLs from a complex string format
        const urlMatches = a.match(/https?:\/\/[^\s"]+/g);
        if (urlMatches) files = urlMatches;
      } else if (Array.isArray(a)) {
        files = a;
      } else if (typeof a === 'object') {
        // Sometimes the answer is {[url]: filename}
        files = Object.keys(a).filter(k => k.startsWith('http'));
      }
    }

    console.log(`ID: ${sub.id} | ${new Date(sub.created_at).toISOString().slice(0, 10)} | ${sub.status}`);
    console.log(`  Email: ${email}`);
    console.log(`  Name:  ${typeof name === 'string' ? name : JSON.stringify(name).slice(0, 80)}`);
    if (files.length > 0) {
      console.log(`  Files (${files.length}):`);
      for (const f of files.slice(0, 3)) {
        const fname = f.split('/').pop() || f;
        console.log(`    - ${fname.slice(0, 80)}`);
      }
    } else {
      console.log(`  Files: none`);
    }
    console.log();
  }
  if (subs.length > 20) console.log(`... and ${subs.length - 20} more`);
})();
