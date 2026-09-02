const fs = require('fs');

function norm(s) {
  if (!s) return '';
  return s.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '')
    .trim();
}

(async () => {
  // Load devoirat.net cards (1,747 unique teachers)
  const duty = fs.readFileSync('/workspace/docs/devoirat/cards-raw.jsonl', 'utf8')
    .trim().split('\n').map(l => JSON.parse(l));
  
  const teacherRe = /^(Mr|Mme|Mlle|Prof|Professeur|Mr\.|Mme\.)\s+(.+)/;
  const dutyTeachers = new Map(); // normalized teacher name → array of cards
  for (const c of duty) {
    const m = c.description?.match(teacherRe);
    if (!m) continue;
    const teacherName = m[2].trim();
    const nk = norm(teacherName);
    if (!nk || nk.length < 3) continue;
    // Only multi-word (lastName + firstName)
    if (teacherName.split(/\s+/).length < 2) continue;
    if (!dutyTeachers.has(nk)) dutyTeachers.set(nk, []);
    dutyTeachers.get(nk).push({...c, teacherName});
  }
  
  console.log(`Devoirat unique teachers (multi-mots): ${dutyTeachers.size}`);
  
  // Load JotForm submissions
  const jotform = fs.readFileSync('/workspace/docs/devoirat/jotform-devoirat.jsonl', 'utf8')
    .trim().split('\n').map(l => JSON.parse(l));
  
  // Filter JotForm: only multi-mot name + has email
  const validJf = jotform.filter(s => {
    const n = (s.name || '').replace(/\s+/g, ' ').trim();
    return n.split(/\s+/).length >= 2 && s.email && s.files && s.files.length > 0;
  });
  console.log(`Valid JF (multi-mots + email): ${validJf.length}`);
  
  // Index valid JF by normalized teacher name (multiple variants)
  const jfByName = new Map();
  for (const s of validJf) {
    const name = s.name.replace(/\s+/g, ' ').trim();
    // Generate multiple key variants
    const parts = name.split(/\s+/);
    const keys = new Set();
    
    if (parts.length === 2) {
      keys.add(norm(parts[0] + parts[1])); // lastName firstName concat
      keys.add(norm(parts[1] + parts[0])); // firstName lastName concat
      keys.add(norm(name));
    } else if (parts.length === 3) {
      // "Bouzouraa Anis Mr" or "Mr Bouzouraa Anis"
      keys.add(norm(parts[0] + parts[1] + parts[2]));
      keys.add(norm(parts[0] + parts[1]));
      keys.add(norm(parts[0] + parts[2]));
      keys.add(norm(parts[1] + parts[0] + parts[2]));
      keys.add(norm(parts[1] + parts[0]));
      keys.add(norm(parts[1] + parts[2]));
    } else if (parts.length === 4) {
      // "Ben Abdallah Marouan" - compound last name
      keys.add(norm(parts[0] + parts[1] + parts[2] + parts[3]));
      keys.add(norm(parts[0] + parts[1] + parts[2] + parts[3]));
      keys.add(norm(parts[2] + parts[3])); // might be the real lastname
      keys.add(norm(parts[2] + parts[3] + parts[0] + parts[1]));
      keys.add(norm(parts.slice(-1) + parts.slice(0, -1).join('')));
    }
    
    keys.forEach(k => {
      if (!k || k.length < 4) return;
      if (!jfByName.has(k)) jfByName.set(k, []);
      jfByName.get(k).push(s);
    });
  }
  console.log(`JF name index size: ${jfByName.size}`);
  
  // Match devoirat.net teachers to JotForm (capture email)
  const matches = []; // {dutyTeacher, email, name, jfSub}
  const unmatched = [];
  
  for (const [nk, cards] of dutyTeachers.entries()) {
    const teacherName = cards[0].teacherName;
    
    // Generate candidate keys from teacher name
    const nameParts = teacherName.replace(/^(Mr|Mme|Mlle|Prof)\s+/, '').trim().split(/\s+/);
    const candidates = new Set([nk]);
    nameParts.forEach((p, i) => {
      const remaining = nameParts.filter((_, j) => j !== i).join('');
      candidates.add(norm(nameParts[i] + remaining));
      candidates.add(norm(remaining + nameParts[i]));
    });
    
    // Find first matching JF submission
    let matched = null;
    for (const k of candidates) {
      const subs = jfByName.get(k);
      if (subs && subs.length > 0) {
        matched = subs[0];
        break;
      }
    }
    
    if (matched) {
      matches.push({
        dutyTeacher: teacherName,
        dutyTeacherCount: cards.length,
        jfEmail: matched.email,
        jfName: matched.name,
        jfId: matched.id,
      });
    } else {
      unmatched.push({ dutyTeacher: teacherName, count: cards.length });
    }
  }
  
  // Unique emails per matched prof
  const emailCounts = new Map();
  matches.forEach(m => {
    emailCounts.set(m.jfEmail, (emailCounts.get(m.jfEmail) || 0) + 1);
  });
  
  console.log(`\n=== COMPARISON (only valid profs with email) ===`);
  console.log(`Devoirat unique teachers: ${dutyTeachers.size}`);
  console.log(`Matched profs in JotForm: ${matches.length} (${(matches.length/dutyTeachers.size*100).toFixed(1)}%)`);
  console.log(`  Unique emails captured: ${emailCounts.size}`);
  console.log(`Unmatched profs (must download from Jimdo): ${unmatched.length}`);
  console.log(`  Total PDFs from unmatched profs: ${unmatched.reduce((a, b) => a + b.count, 0)}`);
  
  // For each unique email, pull ALL submissions from JotForm
  const allSubsByEmail = new Map();
  validJf.forEach(s => {
    if (emailCounts.has(s.email)) {
      if (!allSubsByEmail.has(s.email)) allSubsByEmail.set(s.email, []);
      allSubsByEmail.get(s.email).push(s);
    }
  });
  
  console.log(`\n=== AFTER EMAIL EXPANSION ===`);
  console.log(`Unique emails with files in JotForm: ${allSubsByEmail.size}`);
  
  let totalImportedFiles = 0;
  let totalImportedSubs = 0;
  const fileTypeCounts = {};
  allSubsByEmail.forEach(subs => {
    subs.forEach(s => {
      totalImportedSubs++;
      s.files.forEach(f => {
        totalImportedFiles++;
        const ext = (f.split('.').pop() || 'unknown').toLowerCase().split('?')[0].split('_')[0].slice(0, 10);
        fileTypeCounts[ext] = (fileTypeCounts[ext] || 0) + 1;
      });
    });
  });
  console.log(`Total submissions imported: ${totalImportedSubs}`);
  console.log(`Total files imported: ${totalImportedFiles}`);
  console.log(`\nFile type distribution:`);
  Object.entries(fileTypeCounts).sort((a,b) => b[1] - a[1]).forEach(([k, v]) => console.log(`  .${k}: ${v}`));
  
  console.log(`\n--- Top 20 matched profs ---`);
  const matchesWithFiles = matches.map(m => {
    const subs = allSubsByEmail.get(m.jfEmail) || [];
    const fileCount = subs.reduce((a, s) => a + s.files.length, 0);
    return { ...m, totalSubmissions: subs.length, totalFiles: fileCount };
  }).sort((a, b) => b.totalFiles - a.totalFiles);
  matchesWithFiles.slice(0, 20).forEach(m => {
    console.log(`  ${m.totalFiles.toString().padStart(4)} files | ${m.totalSubmissions.toString().padStart(4)} subs - ${m.dutyTeacher} (${m.jfEmail.slice(0, 30)}...)`);
  });
  
  console.log(`\n--- Top 15 UNMATCHED profs (download from Jimdo) ---`);
  unmatched.sort((a, b) => b.count - a.count).slice(0, 15).forEach(u => {
    console.log(`  ${u.count.toString().padStart(4)} PDFs devoirat - "${u.dutyTeacher}"`);
  });
  
  // Save final match report
  const report = {
    totalDutyTeachers: dutyTeachers.size,
    matchedProfs: matches.length,
    unmatchedProfs: unmatched.length,
    uniqueEmails: emailCounts.size,
    totalImportedFiles,
    totalImportedSubs,
    fileTypeCounts,
    matchedProfsDetailed: matchesWithFiles,
    unmatchedSample: unmatched.slice(0, 100),
  };
  fs.writeFileSync('/workspace/docs/devoirat/final-match.json', JSON.stringify(report, null, 2));
  
  // Save email-to-profs map
  const emailMap = {};
  allSubsByEmail.forEach((subs, email) => {
    const profMatch = matches.find(m => m.jfEmail === email);
    emailMap[email] = {
      profName: profMatch?.dutyTeacher || 'unknown',
      jfName: profMatch?.jfName || 'unknown',
      submissions: subs,
    };
  });
  fs.writeFileSync('/workspace/docs/devoirat/email-map.json', JSON.stringify(emailMap, null, 2));
  
  // Summary line
  console.log(`\n========== FINAL SUMMARY ==========`);
  console.log(`JotForm imports: ${totalImportedFiles} files (${totalImportedSubs} submissions)`);
  console.log(`Jimdo downloads: ${unmatched.reduce((a, b) => a + b.count, 0)} PDFs (${unmatched.length} profs)`);
  console.log(`Total to import: ${totalImportedFiles + unmatched.reduce((a, b) => a + b.count, 0)} files`);
})();
