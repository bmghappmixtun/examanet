const fs = require('fs');

function norm(s) {
  if (!s) return '';
  return s.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '')
    .trim();
}

(async () => {
  // Load devoirat.net cards
  const duty = fs.readFileSync('/workspace/docs/devoirat/cards-raw.jsonl', 'utf8')
    .trim().split('\n').map(l => JSON.parse(l));
  
  // Load JotForm submissions
  const jotform = fs.readFileSync('/workspace/docs/devoirat/jotform-devoirat.jsonl', 'utf8')
    .trim().split('\n').map(l => JSON.parse(l));
  
  // Filter JotForm: only those with files
  const jfWithFiles = jotform.filter(s => s.files && s.files.length > 0);
  
  // Extract teacher names from duty cards
  const teacherRe = /^(Mr|Mme|Mlle|Prof|Professeur|Mr\.|Mme\.)\s+(.+)/;
  const dutyTeachers = new Map(); // normalized teacher name → array of cards
  for (const c of duty) {
    const m = c.description?.match(teacherRe);
    if (!m) continue;
    const teacherName = m[2].trim();
    const nk = norm(teacherName);
    if (!nk || nk.length < 3) continue;
    if (!dutyTeachers.has(nk)) dutyTeachers.set(nk, []);
    dutyTeachers.get(nk).push({...c, teacherName});
  }
  
  // Index JotForm by normalized teacher name (try multiple patterns)
  const jfByTeacher = new Map();
  for (const s of jfWithFiles) {
    const n = (s.name || '').trim();
    if (!n || n.length < 3) continue;
    // Pattern 1: "OUERGHI  CHOKRI" (extra spaces)
    const cleaned = n.replace(/\s+/g, ' ').trim();
    // Try LastName FirstName and FirstName LastName variants
    const parts = cleaned.split(' ');
    const lastFirst = norm(parts[0]) + norm(parts.slice(1).join(''));
    const firstLast = parts.slice(1).join('') + norm(parts[0]);
    [norm(cleaned), lastFirst, firstLast].forEach(k => {
      if (!k || k.length < 3) return;
      if (!jfByTeacher.has(k)) jfByTeacher.set(k, []);
      jfByTeacher.get(k).push(s);
    });
  }
  
  console.log(`Devoirat.net unique teachers: ${dutyTeachers.size}`);
  console.log(`JotForm submissions (with files): ${jfWithFiles.length}`);
  console.log(`JotForm teacher index size: ${jfByTeacher.size}`);
  
  // File type distribution in JotForm
  const fileTypes = {};
  jfWithFiles.forEach(s => {
    s.files.forEach(f => {
      const ext = (f.split('.').pop() || 'unknown').toLowerCase().split('?')[0].slice(0, 10);
      fileTypes[ext] = (fileTypes[ext] || 0) + 1;
    });
  });
  console.log(`\nJotForm file extensions:`);
  Object.entries(fileTypes).sort((a,b) => b[1] - a[1]).forEach(([k, v]) => console.log(`  .${k}: ${v}`));
  
  // Match duty teachers to JotForm
  let withJotform = 0;
  let withoutJotform = 0;
  let withJotformPdfs = 0;
  let withoutJotformPdfs = 0;
  
  const matchedTeachers = new Map(); // duty teacher name → jf submissions
  const unmatchedTeachers = new Map();
  
  for (const [nk, cards] of dutyTeachers.entries()) {
    // Try multiple match strategies
    const findJf = (key) => jfByTeacher.get(key) || [];
    let jfSubs = [];
    
    // Try exact normalized
    jfSubs = jfSubs.concat(findJf(nk));
    
    // Try reverse (lastName+firstName vs firstName+lastName)
    // nk already concatenates in some way; try variants
    if (cards[0].teacherName) {
      const parts = cards[0].teacherName.replace(/^M(r|me|me|elle)\s+/, '').split(/\s+/);
      if (parts.length === 2) {
        const lastFirst = norm(parts[0]) + norm(parts[1]);
        const firstLast = norm(parts[1]) + norm(parts[0]);
        jfSubs = jfSubs.concat(findJf(lastFirst), findJf(firstLast));
      } else if (parts.length >= 3) {
        // 3+ parts = multi-word name
        const lastFirst = norm(parts.slice(-1)[0]) + norm(parts.slice(0, -1).join(''));
        const firstLast = norm(parts.slice(0, -1).join('')) + norm(parts.slice(-1)[0]);
        jfSubs = jfSubs.concat(findJf(lastFirst), findJf(firstLast));
      }
    }
    
    // Dedupe
    jfSubs = [...new Map(jfSubs.map(s => [s.id, s])).values()];
    
    if (jfSubs.length > 0) {
      withJotform++;
      withJotformPdfs += cards.length;
      matchedTeachers.set(cards[0].teacherName, { cards, jfSubs });
    } else {
      withoutJotform++;
      withoutJotformPdfs += cards.length;
      unmatchedTeachers.set(cards[0].teacherName, cards);
    }
  }
  
  console.log(`\n========== COMPARISON ==========`);
  console.log(`Total devoirat PDFs: ${duty.length}`);
  console.log(`Devoirat unique teachers: ${dutyTeachers.size}`);
  console.log(`\nTeachers WITH JotForm submissions: ${withJotform}`);
  console.log(`  → PDFs source JotForm (orig): ${withJotformPdfs}`);
  console.log(`Teachers WITHOUT JotForm submissions: ${withoutJotform}`);
  console.log(`  → PDFs à downloader depuis devoirat.net: ${withoutJotformPdfs}`);
  
  console.log(`\n--- Top 20 matched teachers ---`);
  [...matchedTeachers.entries()]
    .sort((a, b) => b[1].jfSubs.length - a[1].jfSubs.length)
    .slice(0, 20)
    .forEach(([name, data]) => {
      console.log(`  duty ${data.cards.length.toString().padStart(4)} PDFs | jf ${data.jfSubs.length.toString().padStart(4)} files - "${name}"`);
    });
  
  console.log(`\n--- Top 20 unmatched teachers (NO JotForm) ---`);
  [...unmatchedTeachers.entries()]
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 20)
    .forEach(([name, cards]) => {
      console.log(`  duty ${cards.length.toString().padStart(4)} PDFs - "${name}"`);
    });
  
  // Save full match report
  const report = {
    totalDutyPdfs: duty.length,
    totalDutyTeachers: dutyTeachers.size,
    withJotform, withoutJotform,
    withJotformPdfs, withoutJotformPdfs,
    fileTypes,
    matchedSample: [...matchedTeachers.entries()].slice(0, 30),
    unmatchedSample: [...unmatchedTeachers.entries()].slice(0, 30),
  };
  fs.writeFileSync('/workspace/docs/devoirat/jotform-vs-duty.json', JSON.stringify(report, null, 2));
  
  // Save lists of cards to use from each source
  const fromJotform = [];
  const fromDuty = [];
  for (const [name, data] of matchedTeachers.entries()) {
    data.cards.forEach(c => fromJotform.push({ ...c, jfSubCount: data.jfSubs.length }));
  }
  for (const [name, cards] of unmatchedTeachers.entries()) {
    cards.forEach(c => fromDuty.push({ ...c }));
  }
  fs.writeFileSync('/workspace/docs/devoirat/use-from-jotform.json', JSON.stringify(fromJotform, null, 2));
  fs.writeFileSync('/workspace/docs/devoirat/use-from-duty.json', JSON.stringify(fromDuty, null, 2));
  
  console.log(`\nTotal to download from devoirat.net: ${fromDuty.length} (${(fromDuty.length / duty.length * 100).toFixed(1)}% of total)`);
})();
