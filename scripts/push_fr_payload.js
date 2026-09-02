require('dotenv').config({ path: '/workspace/edutunisie/.env.local' });
const fs = require('fs');
const https = require('https');

const TOKEN = process.env.SEED_TOKEN || 'cffa7e495ff6a441d253b03b8cf1efa7';
const ENDPOINT = 'https://examanet.com/api/admin/update-3l-metadata';
const payload = JSON.parse(fs.readFileSync('/workspace/edutunisie/scripts/fr_lycee_payload.json', 'utf-8'));

console.log(`Pushing ${payload.payload.length} items to ${ENDPOINT}`);

async function postJson(url, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const u = new URL(url);
    const req = https.request({
      hostname: u.hostname,
      path: u.pathname + `?token=${TOKEN}`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
      },
    }, (res) => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf-8');
        resolve({ status: res.statusCode, body: text });
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function main() {
  // Send in batches of 20
  const BATCH = 20;
  let totalOk = 0;
  let totalErr = 0;
  
  for (let i = 0; i < payload.payload.length; i += BATCH) {
    const batch = payload.payload.slice(i, i + BATCH);
    const items = batch.map(({ resourceId, generalSubject, shortKeyPoints, description, summary, homeworkSubtype, homeworkNumber, hasCorrection, modelUsed }) => ({
      resourceId,
      generalSubject,
      shortKeyPoints,
      description,
      summary,
      homeworkSubtype,
      homeworkNumber,
      hasCorrection,
      modelUsed,
    }));
    
    try {
      const result = await postJson(ENDPOINT, { items });
      console.log(`Batch ${Math.floor(i/BATCH) + 1}: ${result.status}`);
      if (result.status !== 200) {
        console.log(`  Body: ${result.body.substring(0, 300)}`);
        totalErr += batch.length;
      } else {
        totalOk += batch.length;
      }
    } catch (err) {
      console.log(`Batch error: ${err.message}`);
      totalErr += batch.length;
    }
  }
  
  console.log(`\n=== DONE ===`);
  console.log(`Success: ${totalOk}`);
  console.log(`Errors: ${totalErr}`);
}

main().catch(e => {
  console.error('FATAL:', e);
  process.exit(1);
});
