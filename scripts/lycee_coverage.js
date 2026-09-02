require('dotenv').config({ path: '/workspace/edutunisie/.env.local' });
const { PrismaClient } = require('/workspace/edutunisie/node_modules/@prisma/client');
const p = new PrismaClient({ log: ['error'] });
(async () => {
  const subjects = ['physique', 'svt', 'technologie', 'informatique', 'economie', 'anglais', 'gestion', 'arabe', 'philosophie', 'histoire', 'geographie'];
  
  console.log(`\n=== AI metadata coverage (lycée) ===`);
  console.log(`${'Subject'.padEnd(20)} ${'Total'.padStart(7)} ${'w/GS'.padStart(7)} ${'w/SKP'.padStart(7)} ${'w/Tags'.padStart(8)} ${'w/HW'.padStart(7)} ${'w/Sum'.padStart(7)} ${'BadDesc'.padStart(9)}`);
  
  for (const slug of subjects) {
    const files = await p.resource.findMany({
      where: { 
        status: 'PUBLISHED',
        class: { level: { slug: 'lycee' } },
        subject: { slug },
      },
      select: { 
        id: true,
        description: true,
        summary: true,
        tags: true,
        homeworkSubtype: true,
        metadata: { select: { 
          generalSubject: true, 
          shortKeyPoints: true,
        } },
      },
    });
    if (files.length === 0) continue;
    
    const withGS = files.filter(r => r.metadata?.generalSubject).length;
    const withSKP = files.filter(r => r.metadata?.shortKeyPoints?.length > 0).length;
    const withTags = files.filter(r => r.tags && r.tags.length > 0).length;
    const withHW = files.filter(r => r.homeworkSubtype).length;
    const withSum = files.filter(r => r.summary && r.summary.length > 50).length;
    const badDesc = files.filter(r => 
      r.description && (
        r.description.toLowerCase().includes('je suis désolé') ||
        r.description.toLowerCase().includes('i cannot') ||
        r.description.toLowerCase().includes('i apologize') ||
        r.description.toLowerCase().includes('as an ai') ||
        r.description.length < 50
      )
    ).length;
    
    console.log(`${slug.padEnd(20)} ${String(files.length).padStart(7)} ${String(withGS).padStart(7)} ${String(withSKP).padStart(7)} ${String(withTags).padStart(8)} ${String(withHW).padStart(7)} ${String(withSum).padStart(7)} ${String(badDesc).padStart(9)}`);
  }
  
  await p.$disconnect();
})();
