import fs from 'fs';
import https from 'https';
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

const resources = await p.resource.findMany({
  where: { descriptionSource: 'gpt-4o-mini-title-enriched' },
  select: { id: true, fileUrl: true, fileSize: true }
});
console.log(`Total: ${resources.length}`);

const outputDir = '/workspace/scripts/seo_prod/jotform_pdfs/';
fs.mkdirSync(outputDir, { recursive: true });

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https.get(url, (response) => {
      if (response.statusCode === 200) {
        response.pipe(file);
        file.on('finish', () => file.close(() => resolve(true)));
      } else {
        file.destroy();
        fs.unlink(dest, () => {});
        resolve(false);
      }
    }).on('error', () => {
      fs.unlink(dest, () => {});
      resolve(false);
    });
  });
}

let downloaded = 0, failed = 0;
const CONCURRENCY = 15;
let i = 0;

async function worker() {
  while (i < resources.length) {
    const idx = i++;
    const r = resources[idx];
    const safeName = r.id.replace(/[^a-zA-Z0-9]/g, '_');
    const dest = `${outputDir}${safeName}.pdf`;
    
    // Check if exists with reasonable size (>1KB)
    let needsDl = true;
    try {
      const stat = fs.statSync(dest);
      if (stat.size > 1024) needsDl = false;
      else fs.unlinkSync(dest);
    } catch (e) {}
    
    if (needsDl) {
      const ok = await download(r.fileUrl, dest);
      if (ok) downloaded++;
      else failed++;
    }
  }
}

await Promise.all(Array(CONCURRENCY).fill().map(worker));
console.log(`Downloaded: ${downloaded}, Failed: ${failed}`);
await p.$disconnect();
