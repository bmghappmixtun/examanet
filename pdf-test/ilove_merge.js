const ILovePDFApi = require('@ilovepdf/ilovepdf-nodejs');
const ILovePDFFile = require('@ilovepdf/ilovepdf-nodejs/ILovePDFFile');
const fs = require('fs');
const publicKey = process.argv[2];
const secretKey = process.argv[3];
// PDFs to merge, in order (first arg is original/enonce, rest appended)
const pdfPaths = process.argv.slice(4, process.argv.length - 1);
const outPath = process.argv[process.argv.length - 1];

async function main() {
  if (pdfPaths.length < 2) {
    console.error('ERR: need at least 2 PDFs to merge');
    process.exit(1);
  }
  console.log(`Merging ${pdfPaths.length} files in order:`);
  pdfPaths.forEach((p, i) => console.log(`  [${i}] ${p}`));
  
  const api = new ILovePDFApi(publicKey, secretKey);
  const task = api.newTask('merge');
  await task.start();
  
  for (const p of pdfPaths) {
    const file = new ILovePDFFile(p);
    await task.addFile(file);
  }
  
  await task.process();
  const data = await task.download();
  fs.writeFileSync(outPath, data);
  console.log('OK:' + data.length);
}
main().catch(e => { console.error('ERR:' + e.message); process.exit(1); });
