require('dotenv').config({ path: '/workspace/edutunisie/.env.local' });
const { PrismaClient } = require('/workspace/edutunisie/node_modules/@prisma/client');
const p = new PrismaClient({ log: ['error'] });
(async () => {
  const prof = await p.user.findFirst({ where: { numericId: 1199 } });
  const profId = prof.id;
  const files = await p.$queryRaw`
    SELECT r."numericId", r.title, cnt."pageCount", LENGTH(cnt."fullText") as text_len,
      LENGTH(cnt."fullText") / NULLIF(cnt."pageCount", 0) as chars_per_page
    FROM "Resource" r
    JOIN "ResourceContent" cnt ON cnt."resourceId" = r.id
    WHERE r."teacherId" = ${profId}
    ORDER BY r."numericId" ASC
  `;
  console.log(`Files: ${files.length}`);
  for (const f of files) {
    const cpp = f.chars_per_page || 0;
    const lowCoverage = cpp < 200 ? '⚠️ LOW' : '✓';
    console.log(`  #${f.numericId} pages=${f.pageCount} text=${f.text_len}b (~${cpp}ch/page) ${lowCoverage}: ${f.title.substring(0, 60)}`);
  }
  await p.$disconnect();
})();
