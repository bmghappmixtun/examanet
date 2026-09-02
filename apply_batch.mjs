import fs from 'fs';
function loadEnv(file) {
  if (!fs.existsSync(file)) return;
  const lines = fs.readFileSync(file, 'utf8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const m = trimmed.match(/^([A-Z_][A-Z0-9_]*)\s*=\s*"?([^"]*)"?$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}
loadEnv('/workspace/edutunisie/.env.local');
loadEnv('/workspace/edutunisie/.env');
const { PrismaClient } = await import('@prisma/client');
const p = new PrismaClient();
const records = [];
for (const line of fs.readFileSync('/workspace/scripts/seo_prod/output/descriptions.jsonl', 'utf8').split('\n')) {
  if (line.trim()) records.push(JSON.parse(line));
}
let updated = 0;
for (const r of records) {
  try {
    await p.resource.update({
      where: { id: r.id },
      data: {
        description: r.description,
        metaDescription: r.metaDescription,
        descriptionGeneratedAt: new Date(),
        descriptionSource: 'gemini-prod-v1',
      }
    });
    updated++;
  } catch {}
}
console.log(`Applied ${updated}`);
await p.$disconnect();
