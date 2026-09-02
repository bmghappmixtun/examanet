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
const total = await p.resource.count();
const by_source = await p.resource.groupBy({
  by: ['descriptionSource'],
  _count: true,
  where: { descriptionSource: { startsWith: 'gpt-4o-mini-' }}
});
console.log(`Total: ${total}`);
console.log('\nBy source:');
for (const r of by_source) {
  console.log(`  ${r.descriptionSource}: ${r._count}`);
}
const noDesc = await p.resource.count({ where: { 
  OR: [{ description: null }, { descriptionSource: null }] 
}});
console.log(`\nNo description: ${noDesc}`);
await p.$disconnect();
