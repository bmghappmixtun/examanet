require('dotenv').config({ path: '/workspace/edutunisie/.env.local' });
const { PrismaClient } = require('/workspace/edutunisie/node_modules/@prisma/client');
const p = new PrismaClient({ log: ['error'] });
(async () => {
  const prof = await p.user.findFirst({ where: { numericId: 1199 } });
  const profId = prof.id;
  
  // Get all his resources
  const files = await p.$queryRaw`
    SELECT r.id, r."numericId", r."fileKey", r.title, r.type, r."schoolType",
      s.slug as subject_slug, c.slug as class_slug, sec."nameFr" as section_name,
      cnt."fullText", cnt."pageCount",
      rm."modelUsed", rm."keyInsights"
    FROM "Resource" r
    JOIN "Subject" s ON r."subjectId" = s.id
    JOIN "Class" c ON r."classId" = c.id
    LEFT JOIN "Section" sec ON r."sectionId" = sec.id
    LEFT JOIN "ResourceContent" cnt ON cnt."resourceId" = r.id
    LEFT JOIN "ResourceMetadata" rm ON rm."resourceId" = r.id
    WHERE r."teacherId" = ${profId}
    ORDER BY r."numericId" ASC
  `;
  
  console.log(`Total files: ${files.length}`);
  
  // Plan: for each file, re-extract with AI
  // We need to:
  // 1. Take the FULL text (up to a max of e.g. 30000 chars to fit in 8k tokens)
  // 2. Send to GPT-4o-mini with a strong prompt to extract keyInsights for ALL exercises
  // 3. Update keyInsights in DB
  
  const plan = files.map(f => ({
    id: f.id,
    numericId: f.numericId,
    fileKey: f.fileKey,
    title: f.title,
    subject: f.subject_slug,
    class: f.class_slug,
    section: f.section_name,
    pageCount: f.pageCount,
    textLen: f.fullText?.length || 0,
    currentKeyInsights: f.keyInsights?.length || 0,
  }));
  require('fs').writeFileSync('/tmp/prof_1199_plan.json', JSON.stringify(plan, null, 2));
  console.log(`\nPlan written to /tmp/prof_1199_plan.json`);
  console.log('\n=== File summary ===');
  for (const f of plan) {
    console.log(`  #${f.numericId} pages=${f.pageCount} text=${f.textLen}b kI=${f.currentKeyInsights}: ${f.title.substring(0, 60)}`);
  }
  
  await p.$disconnect();
})();
