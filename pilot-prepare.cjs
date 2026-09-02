const fs = require('fs');

const sample = JSON.parse(fs.readFileSync('/workspace/docs/devoirat/pilot/20-profs.json', 'utf8'));
const emailMap = JSON.parse(fs.readFileSync('/workspace/docs/devoirat/email-map.json', 'utf8'));

// For each pilot prof, extract submissions with details
const pilotData = sample.map(p => {
  const subs = emailMap[p.email].submissions;
  // Stats
  const fileExts = {};
  const files = [];
  subs.forEach(s => {
    s.files.forEach(f => {
      const ext = (f.split('.').pop() || 'unknown').toLowerCase().split('?')[0].split('_')[0].slice(0, 10);
      fileExts[ext] = (fileExts[ext] || 0) + 1;
      files.push({
        url: f,
        ext,
        name: f.split('/').pop() || '',
        title: s.type || '',
        subId: s.id,
        created: s.created,
        subject: s.subject || '',
        class: s.classe || '',
        year: s.year || '',
        section: s.section || '',
      });
    });
  });
  
  return {
    profName: p.profName,
    jfName: p.jfName,
    email: p.email,
    subCount: subs.length,
    fileCount: files.length,
    fileExts,
    files,
  };
});

pilotData.forEach(p => {
  const pdfs = p.fileExts.pdf || 0;
  const words = (p.fileExts.docx || 0) + (p.fileExts.doc || 0);
  const total = p.fileCount;
  console.log(`${p.profName.padEnd(30)} | ${p.subCount.toString().padStart(3)} subs | ${pdfs.toString().padStart(3)} PDFs | ${words.toString().padStart(3)} Words | ${p.email}`);
});

const totalFiles = pilotData.reduce((a, p) => a + p.fileCount, 0);
const totalPDFs = pilotData.reduce((a, p) => a + (p.fileExts.pdf || 0), 0);
const totalWords = pilotData.reduce((a, p) => a + (p.fileExts.docx || 0) + (p.fileExts.doc || 0), 0);
console.log(`\nTotal: ${totalFiles} files (${totalPDFs} PDFs + ${totalWords} Words)`);

fs.writeFileSync('/workspace/docs/devoirat/pilot/20-profs-files.json', JSON.stringify(pilotData, null, 2));
