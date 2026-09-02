const fs = require('fs');
const k = '7312267369dbfc1c06dab2cf7cba4dc1';
const FORM_ID = '2880314284';
const FORM_NAME = 'devoirat';
const OUT = `/workspace/docs/devoirat/jotform-${FORM_NAME}.jsonl`;

async function pull(offset = 0, limit = 500) {
  const url = `https://eu-api.jotform.com/form/${FORM_ID}/submissions?apiKey=${k}&limit=${limit}&offset=${offset}&orderBy=created_at`;
  const r = await fetch(url);
  const d = await r.json();
  if (d.responseCode !== 200) {
    console.error('API error:', d.message, 'status', d.responseCode, d);
    return [];
  }
  return d.content || [];
}

(async () => {
  const out = fs.openSync(OUT, 'w');
  let offset = 0;
  let total = 0;
  const startedAt = Date.now();
  
  while (true) {
    const subs = await pull(offset, 500);
    if (subs.length === 0) break;
    
    for (const sub of subs) {
      const ans = sub.answers || {};
      // Try to find key fields
      const findByText = (rx) => Object.entries(ans).find(([_, v]) => rx.test(v.text || ''));
      const findByName = (name) => Object.entries(ans).find(([_, v]) => v.name === name);
      
      // Try multiple field name patterns
      const nomEntry = findByName('votreNom0') || findByText(/votre nom|nom et pr[ée]nom|nom/i);
      const fileEntry = findByText(/t[ée]l[ée]charg|file|fichier/i);
      const classeEntry = findByText(/classe|class|niveau/i);
      const sectionEntry = findByText(/section|branch/i);
      const yearEntry = findByText(/ann[ée]e scolaire|year/i);
      const typeEntry = findByText(/type de fichier|type/i);
      const subjEntry = findByText(/mati[èe]re|subject|module/i);
      const emailEntry = findByText(/e-?mail/i);
      
      // Extract files (JotForm answer can be string, array, or object)
      let fileUrls = [];
      const fileAns = fileEntry?.[1]?.answer;
      if (fileAns) {
        if (Array.isArray(fileAns)) fileUrls = fileAns;
        else if (typeof fileAns === 'string') {
          // Try URL parse
          const matches = fileAns.match(/https?:\/\/[^\s"]+/g);
          if (matches) fileUrls = matches;
          else fileUrls = [fileAns];
        } else if (typeof fileAns === 'object') {
          fileUrls = Object.keys(fileAns).filter(k => k.startsWith('http'));
        }
      }
      
      // Cleanup
      const cleanName = (s) => typeof s === 'string' ? s.replace(/^"(.*)"$/, '$1').trim() : (s?.first || '') + ' ' + (s?.last || '');
      const cleanAns = (s) => typeof s === 'string' ? s.trim() : s;
      
      const record = {
        id: sub.id,
        created: new Date(sub.created_at).toISOString(),
        status: sub.status,
        name: cleanName(nomEntry?.[1]?.answer || ''),
        email: cleanAns(emailEntry?.[1]?.answer || ''),
        files: fileUrls,
        classe: cleanAns(classeEntry?.[1]?.answer || ''),
        section: cleanAns(sectionEntry?.[1]?.answer || ''),
        year: cleanAns(yearEntry?.[1]?.answer || ''),
        type: cleanAns(typeEntry?.[1]?.answer || ''),
        subject: cleanAns(subjEntry?.[1]?.answer || ''),
      };
      
      fs.writeSync(out, JSON.stringify(record) + '\n');
      total++;
    }
    
    offset += subs.length;
    process.stdout.write(`Pulled ${total} subs (offset ${offset})\n`);
    if (subs.length < 500) break; // last page
    if (offset > 20000) break; // safety
  }
  
  fs.closeSync(out);
  console.log(`\nTotal pulled: ${total} in ${((Date.now() - startedAt) / 1000).toFixed(1)}s`);
})();
