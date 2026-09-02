require('dotenv').config({ path: '/workspace/edutunisie/.env.local' });
const { PrismaClient } = require('/workspace/edutunisie/node_modules/@prisma/client');
const p = new PrismaClient({ log: ['error'] });
(async () => {
  // Find resources where tags is JSON-like
  const candidates = await p.$queryRaw`
    SELECT id, "numericId", tags FROM "Resource" 
    WHERE tags LIKE '{%' OR tags LIKE '[%'
  `;
  console.log(`Files with JSON tags: ${candidates.length}`);
  let fixed = 0;
  for (const f of candidates) {
    if (!f.tags) continue;
    let parsed;
    try {
      // Try to parse as JSON array or set
      parsed = JSON.parse(f.tags);
      if (Array.isArray(parsed)) {
        const csv = parsed.map(x => String(x).trim()).filter(Boolean).join(', ');
        await p.resource.update({ where: { id: f.id }, data: { tags: csv } });
        fixed++;
      } else if (typeof parsed === 'object') {
        // JSON set: {"a","b","c"} - extract keys
        const csv = Object.keys(parsed).join(', ');
        await p.resource.update({ where: { id: f.id }, data: { tags: csv } });
        fixed++;
      }
    } catch (e) {
      // Not JSON, skip
    }
  }
  console.log(`Fixed ${fixed} files`);
  await p.$disconnect();
})();
