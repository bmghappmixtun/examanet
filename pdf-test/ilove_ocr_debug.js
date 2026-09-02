const ILovePDFApi = require('@ilovepdf/ilovepdf-nodejs');
const ILovePDFFile = require('@ilovepdf/ilovepdf-nodejs/ILovePDFFile');
const fs = require('fs');
const publicKey = process.argv[2];
const secretKey = process.argv[3];
const pdfPath = process.argv[4];
const outPath = process.argv[5];
const langs = process.argv[6].split(',');

async function main() {
  const api = new ILovePDFApi(publicKey, secretKey);
  const task = api.newTask('pdfocr');
  
  // Log the token
  const auth = task.auth || task.xhr?.auth;
  if (auth) {
    const token = await auth.getToken();
    console.error('TOKEN:', token.slice(0, 50) + '...');
  }
  
  await task.start();
  const file = new ILovePDFFile(pdfPath);
  await task.addFile(file);
  await task.process({ ocr_languages: langs });
  const data = await task.download();
  fs.writeFileSync(outPath, data);
  console.log('OK:' + data.length);
}

main().catch(e => { 
  console.error('ERR:' + e.message);
  if (e.response) {
    console.error('Status:', e.response.status);
    console.error('Data:', JSON.stringify(e.response.data).slice(0, 300));
  }
  process.exit(1); 
});
