require('dotenv').config({ path: '/workspace/edutunisie/.env.local' });
const { PrismaClient } = require('/workspace/edutunisie/node_modules/@prisma/client');
const p = new PrismaClient({ log: ['error'] });
(async () => {
  // Compare: pageCount vs text length (rough estimate)
  // 1 page ≈ 1500-2500 chars for a typical PDF
  // If pageCount says 2 but text is 50000 chars → 25 pages
  const r = await p.$queryRaw`
    SELECT 
      r."numericId",
      cnt."pageCount" as pc,
      LENGTH(cnt."fullText") as text_len,
      ROUND(LENGTH(cnt."fullText") / 2000.0) as estimated_pages
    FROM "ResourceContent" cnt
    JOIN "Resource" r ON r.id = cnt."resourceId"
    WHERE r.status = 'PUBLISHED' AND cnt."pageCount" IS NOT NULL
  `;
  // Find files where pageCount is way off from text-based estimate
  const suspicious = r.filter(x => {
    const ratio = x.estimated_pages / Math.max(1, x.pc);
    return ratio > 3 || ratio < 0.33;
  });
  console.log(`Files where pageCount seems wrong vs text length: ${suspicious.length}`);
  console.log('Sample:');
  for (const s of suspicious.slice(0, 10)) {
    console.log(`  #${s.numericId}: pageCount=${s.pc}, text=${s.text_len}b, est=${s.estimated_pages} pages`);
  }
  await p.$disconnect();
})();
