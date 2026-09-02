const fs = require('fs');
const subs = fs.readFileSync('/workspace/docs/devoirat/jotform-devoirat.jsonl', 'utf8')
  .trim().split('\n').map(l => JSON.parse(l));

// Spam patterns
const spamEmailRe = /\.oast\.online|mailinator|tempmail|guerrillamail|\.test\.|\.example\./i;
let noEmail = 0, spam = 0, botName = 0, normalName = 0, testFiles = 0;
const singleNames = [];
const multiNames = [];

subs.forEach(s => {
  // No email
  if (!s.email) noEmail++;
  // Spam email
  if (spamEmailRe.test(s.email || '')) spam++;
  // Test files
  if (s.files?.some(f => /test\.pdf|devoir\s*test/i.test(f))) testFiles++;
  // Name analysis
  if (s.name) {
    const parts = s.name.replace(/\s+/g, ' ').trim().split(' ');
    if (parts.length === 1) {
      singleNames.push(s.id);
    } else {
      multiNames.push(s.id);
      normalName++;
    }
  } else {
    botName++;
  }
});

console.log(`Total submissions: ${subs.length}`);
console.log(`\nName analysis:`);
console.log(`  Multi-word names: ${multiNames.length} (${(multiNames.length/subs.length*100).toFixed(1)}%)`);
console.log(`  Single-word names: ${singleNames.length} (${(singleNames.length/subs.length*100).toFixed(1)}%)`);
console.log(`  Empty names: ${botName}`);
console.log(`\nEmail analysis:`);
console.log(`  No email: ${noEmail} (${(noEmail/subs.length*100).toFixed(1)}%)`);
console.log(`  Spam/bot pattern: ${spam}`);
console.log(`\nFile analysis:`);
console.log(`  Test/dev filenames: ${testFiles}`);
console.log(`\n=== Sample single names (first 15) ===`);
console.log(subs.filter(s => s.name && s.name.trim().split(' ').length === 1)
  .slice(0, 15).map(s => `"${s.name}"`).join('\n'));
console.log(`\n=== Sample empty names (first 10) ===`);
console.log(subs.filter(s => !s.name).slice(0, 10).map(s => `${s.id} | files: ${s.files?.[0]?.split('/').pop()?.slice(0, 50)}`).join('\n'));

// Group by teacher to see distribution
const teacherCounts = {};
subs.forEach(s => {
  const n = (s.name || '').replace(/\s+/g, ' ').trim();
  if (n) teacherCounts[n] = (teacherCounts[n] || 0) + 1;
});
const teachers = Object.entries(teacherCounts).sort((a,b) => b[1] - a[1]);
console.log(`\n=== Unique teachers in JotForm (cleaned): ${teachers.length}`);
console.log('Top 30:');
teachers.slice(0, 30).forEach(([n, c]) => console.log(`  ${c.toString().padStart(4)} - "${n}"`));

