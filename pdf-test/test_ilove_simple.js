const ILovePDFApi = require('@ilovepdf/ilovepdf-nodejs');
const publicKey = 'project_public_d1448365692fd5dee0aa5e617dc877a3_oZ7Rs0e163492d3ce295974b66731db65ce9c';
const secretKey = 'secret_key_5090a237520cd8bf28007277b0a8eaae_wePIX80644e3e7875908c7d17221d417f8cf5';
const api = new ILovePDFApi(publicKey, secretKey);
const task = api.newTask('pdfocr');
task.start().then(r => {
  console.log('OK start, response:', JSON.stringify(r).slice(0, 500));
}).catch(e => {
  console.error('ERR start:', e.message);
  console.error('ERR data:', JSON.stringify(e.response?.data || 'no data'));
  console.error('ERR status:', e.response?.status);
});
