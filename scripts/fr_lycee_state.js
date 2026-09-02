require('dotenv').config({ path: '/workspace/edutunisie/.env.local' });
const { PrismaClient } = require('/workspace/edutunisie/node_modules/@prisma/client');
const p = new PrismaClient({ log: ['error'] });
(async () => {
  const files = await p.resource.findMany({
    where: { 
      status: 'PUBLISHED',
      subject: { slug: 'francais' },
      class: { level: { slug: 'lycee' } },
    },
    select: { 
      id: true, numericId: true, title: true, type: true,
      description: true, summary: true, hasCorrection: true,
      homeworkSubtype: true, homeworkNumber: true,
      tags: true,
      year: true, trimester: true,
      class: { select: { nameFr: true, slug: true } },
      section: { select: { nameFr: true } },
      teacher: { select: { firstName: true, lastName: true } },
      metadata: { select: { 
        generalSubject: true, 
        keyPoints: true,
        shortKeyPoints: true,
        topics: true,
        modelUsed: true,
      } },
    },
    orderBy: { numericId: 'asc' },
  });
  
  console.log(`\n=== 🇫🇷 FRANÇAIS LYCÉE — ÉTAT ACTUEL ===`);
  console.log(`Total: ${files.length} fichiers\n`);
  
  // Coverage
  const withGS = files.filter(r => r.metadata?.generalSubject).length;
  const withKP = files.filter(r => r.metadata?.keyPoints?.length > 0).length;
  const withSKP = files.filter(r => r.metadata?.shortKeyPoints?.length > 0).length;
  const withTopics = files.filter(r => r.metadata?.topics?.length > 0).length;
  const withTags = files.filter(r => r.tags && r.tags.length > 0).length;
  const withSum = files.filter(r => r.summary && r.summary.length > 50).length;
  const withDesc = files.filter(r => r.description && r.description.length > 50).length;
  const withCorr = files.filter(r => r.hasCorrection).length;
  const withHW = files.filter(r => r.homeworkSubtype).length;
  const badDesc = files.filter(r => 
    r.description && (
      r.description.toLowerCase().includes('je suis désolé') ||
      r.description.toLowerCase().includes('i cannot') ||
      r.description.toLowerCase().includes('as an ai') ||
      r.description.length < 50
    )
  );
  const modelUsed = files.find(r => r.metadata?.modelUsed)?.metadata?.modelUsed;
  
  console.log(`📊 COVERAGE`);
  console.log(`  AI metadata (generalSubject):       ${withGS}/${files.length} (${(withGS/files.length*100).toFixed(0)}%)`);
  console.log(`  AI metadata (keyPoints):             ${withKP}/${files.length} (${(withKP/files.length*100).toFixed(0)}%)`);
  console.log(`  AI metadata (shortKeyPoints):       ${withSKP}/${files.length} (${(withSKP/files.length*100).toFixed(0)}%)`);
  console.log(`  AI metadata (topics):                ${withTopics}/${files.length} (${(withTopics/files.length*100).toFixed(0)}%)`);
  console.log(`  Resource.tags (CSV):                 ${withTags}/${files.length} (${(withTags/files.length*100).toFixed(0)}%)`);
  console.log(`  Resource.summary:                    ${withSum}/${files.length} (${(withSum/files.length*100).toFixed(0)}%)`);
  console.log(`  Resource.description:                ${withDesc}/${files.length} (${(withDesc/files.length*100).toFixed(0)}%)`);
  console.log(`  Resource.hasCorrection:              ${withCorr}/${files.length}`);
  console.log(`  Resource.homeworkSubtype:            ${withHW}/${files.length} (${(withHW/files.length*100).toFixed(0)}%)`);
  console.log(`  Modèle AI utilisé:                   ${modelUsed || 'N/A'}`);
  console.log(`  Bad descriptions:                    ${badDesc.length}`);
  
  // By type
  const byType = {};
  files.forEach(f => { byType[f.type] = (byType[f.type] || 0) + 1; });
  console.log(`\n📂 PAR TYPE`);
  for (const [t, c] of Object.entries(byType).sort((a,b) => b[1]-a[1])) {
    console.log(`  ${t.padEnd(15)}: ${String(c).padStart(4)} fichiers`);
  }
  
  // By class
  const byClass = {};
  files.forEach(f => { 
    const k = f.class?.nameFr || '?';
    byClass[k] = (byClass[k] || 0) + 1; 
  });
  console.log(`\n📚 PAR CLASSE`);
  for (const [c, n] of Object.entries(byClass).sort((a,b) => b[1]-a[1])) {
    console.log(`  ${c.padEnd(25)}: ${String(n).padStart(4)} fichiers`);
  }
  
  // By section
  const bySection = {};
  files.forEach(f => { 
    const k = f.section?.nameFr || '(aucune)';
    bySection[k] = (bySection[k] || 0) + 1; 
  });
  console.log(`\n🎓 PAR SECTION`);
  for (const [s, n] of Object.entries(bySection).sort((a,b) => b[1]-a[1])) {
    console.log(`  ${s.padEnd(35)}: ${String(n).padStart(4)} fichiers`);
  }
  
  // By schoolType
  const bySchool = {};
  const allFiles = await p.resource.findMany({
    where: { 
      status: 'PUBLISHED',
      subject: { slug: 'francais' },
      class: { level: { slug: 'lycee' } },
    },
    select: { id: true, schoolType: true },
  });
  allFiles.forEach(f => { bySchool[f.schoolType || '?'] = (bySchool[f.schoolType || '?'] || 0) + 1; });
  console.log(`\n🏫 PAR TYPE D'ÉCOLE`);
  for (const [s, n] of Object.entries(bySchool).sort((a,b) => b[1]-a[1])) {
    console.log(`  ${s.padEnd(15)}: ${String(n).padStart(4)} fichiers`);
  }
  
  // Profs
  const byProf = {};
  files.forEach(f => {
    const k = `${f.teacher?.firstName || '?'} ${f.teacher?.lastName || '?'}`;
    byProf[k] = (byProf[k] || 0) + 1;
  });
  console.log(`\n👨‍🏫 TOP 10 PROFS`);
  Object.entries(byProf).sort((a,b) => b[1]-a[1]).slice(0, 10).forEach(([p, n]) => {
    console.log(`  ${p.padEnd(30)}: ${String(n).padStart(4)} fichiers`);
  });
  
  // Titles format
  const withNewTitle = files.filter(f => /:\s+[^:]+$/.test(f.title)).length;
  const oldFormat = files.length - withNewTitle;
  console.log(`\n📝 TITRES`);
  console.log(`  Format standard (avec : GS):        ${withNewTitle}/${files.length}`);
  console.log(`  Ancien format:                       ${oldFormat}/${files.length}`);
  
  // Year distribution
  const byYear = {};
  files.forEach(f => { byYear[f.year || '?'] = (byYear[f.year || '?'] || 0) + 1; });
  console.log(`\n📅 PAR ANNÉE SCOLAIRE (top 5)`);
  Object.entries(byYear).sort((a,b) => b[1]-a[1]).slice(0, 5).forEach(([y, n]) => {
    console.log(`  ${y.padEnd(15)}: ${String(n).padStart(4)} fichiers`);
  });
  
  // Disk size
  const sizes = await p.resource.findMany({
    where: { 
      status: 'PUBLISHED',
      subject: { slug: 'francais' },
      class: { level: { slug: 'lycee' } },
    },
    select: { fileSize: true, pageCount: true },
  });
  const totalBytes = sizes.reduce((s, f) => s + (f.fileSize || 0), 0);
  const totalPages = sizes.reduce((s, f) => s + (f.pageCount || 0), 0);
  const avgSize = Math.round(totalBytes / sizes.length / 1024);
  const avgPages = (totalPages / sizes.length).toFixed(1);
  console.log(`\n💾 DISK`);
  console.log(`  Total: ${(totalBytes/1024/1024).toFixed(1)} MB`);
  console.log(`  Moyenne: ${avgSize} KB par fichier, ${avgPages} pages`);
  
  // Engagement
  const engagement = await p.resource.aggregate({
    where: { 
      status: 'PUBLISHED',
      subject: { slug: 'francais' },
      class: { level: { slug: 'lycee' } },
    },
    _sum: { viewsCount: true, downloadsCount: true, favoritesCount: true },
    _avg: { avgRating: true, ratingCount: true },
  });
  console.log(`\n📈 ENGAGEMENT`);
  console.log(`  Total views:      ${engagement._sum.viewsCount}`);
  console.log(`  Total downloads:  ${engagement._sum.downloadsCount}`);
  console.log(`  Total favorites:  ${engagement._sum.favoritesCount}`);
  console.log(`  Avg rating:       ${engagement._avg.avgRating?.toFixed(2) || 'N/A'}`);
  console.log(`  Total ratings:    ${engagement._sum.ratingCount || 0}`);
  
  // Bad descriptions
  if (badDesc.length > 0) {
    console.log(`\n❌ BAD DESCRIPTIONS (${badDesc.length}):`);
    badDesc.forEach(r => console.log(`  #${r.numericId}: ${r.description?.substring(0, 60)}`));
  }
  
  await p.$disconnect();
})();
