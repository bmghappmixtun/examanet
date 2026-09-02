import fs from 'fs';
function loadEnv(file) {
  if (!fs.existsSync(file)) return;
  fs.readFileSync(file, 'utf8').split('\n').forEach(line => {
    const m = line.trim().match(/^([A-Z_][A-Z0-9_]*)\s*=\s*"?([^"]*)"?$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  });
}
loadEnv('/workspace/edutunisie/.env.local');
loadEnv('/workspace/edutunisie/.env');

const { PrismaClient } = await import('@prisma/client');
const prisma = new PrismaClient();

const counts = await prisma.resource.groupBy({
  by: ['descriptionSource', 'language'],
  _count: true,
  where: { descriptionSource: 'agent-v2-multilingual' },
});
console.log('=== SEO Source Counts ===');
counts.forEach(c => console.log(`${c.descriptionSource} | ${c.language}: ${c._count}`));

const samples = await prisma.resource.findMany({
  where: { descriptionSource: 'agent-v2-multilingual' },
  select: { id: true, title: true, language: true, description: true, metaDescription: true },
  take: 3,
});
console.log('\n=== Samples ===');
samples.forEach(s => {
  console.log(`\n[${s.language}] ${s.title}`);
  console.log(`  desc: ${s.description?.substring(0, 150)}...`);
  console.log(`  meta: ${s.metaDescription}`);
});

await prisma.$disconnect();
