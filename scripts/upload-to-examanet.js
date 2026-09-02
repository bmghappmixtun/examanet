#!/usr/bin/env node
/**
 * upload-to-examanet.js
 * Upload a manifest of PDFs to Examanet platform.
 * Usage: node upload-to-examanet.js <manifest.json>
 * Requires: BASE_URL env, ADMIN_TOKEN env (or login as teacher)
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const { URL } = require('url');

const BASE_URL = process.env.BASE_URL || 'https://examanet.com';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'boutiti.mehdi@gmail.com';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'demo1234';
const SEED_TOKEN = process.env.SEED_TOKEN; // Required from env — never hardcode

// Default mapping from filename pattern to Examanet slug
const SUBJECT_MAP = {
  'math': 'mathematiques',
  'physique': 'physique',
  'svt': 'sciences',
  'science': 'sciences',
  'francais': 'francais',
  'anglais': 'anglais',
  'arabe': 'arabe',
  'informatique': 'informatique',
  'histoire': 'histoire',
  'geo': 'histoire',
  'technologie': 'technologie'
};

const CLASS_MAP = {
  '7ème': '7eme',
  '7eme': '7eme',
  '8ème': '8eme',
  '8eme': '8eme',
  '9ème': '9eme',
  '9eme': '9eme',
  '1ère': '1ere-secondaire',
  '1ere': '1ere-secondaire',
  '2ème-secondaire': '2eme-secondaire',
  '2eme-secondaire': '2eme-secondaire',
  '3ème-secondaire': '3eme-secondaire',
  '3eme-secondaire': '3eme-secondaire',
  '4ème': '4eme-secondaire',
  '4eme': '4eme-secondaire',
  'bac': '4eme-secondaire'
};

function makeRequest(url, options = {}, body = null) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = https.request({
      hostname: u.hostname,
      path: u.pathname + u.search,
      method: options.method || 'GET',
      headers: options.headers || {},
    }, (res) => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString();
        resolve({
          status: res.statusCode,
          headers: res.headers,
          text,
          json: () => {
            try { return JSON.parse(text); } catch { return null; }
          }
        });
      });
    });
    req.on('error', reject);
    if (body) {
      if (Buffer.isBuffer(body)) req.write(body);
      else req.write(JSON.stringify(body));
    }
    req.end();
  });
}

async function login(email, password) {
  console.log(`Logging in as ${email}...`);
  const res = await makeRequest(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, { email, password });

  const data = res.json();
  if (!res.status.toString().startsWith('2') || !data?.success) {
    throw new Error(`Login failed: ${JSON.stringify(data)}`);
  }

  // Extract cookie
  const setCookie = res.headers['set-cookie'];
  let cookie = '';
  if (setCookie) {
    cookie = setCookie.map(c => c.split(';')[0]).join('; ');
  }

  if (!cookie) throw new Error('No session cookie received');

  return { cookie, user: data.user };
}

async function uploadOne(session, file) {
  if (!fs.existsSync(file.localPath)) {
    throw new Error(`File not found: ${file.localPath}`);
  }

  const buffer = fs.readFileSync(file.localPath);

  // Build multipart/form-data manually (no extra deps)
  const boundary = '----formdata-' + Date.now();
  const filename = file.filename;

  // Determine subject from filename
  let subjectSlug = null;
  const lowerName = filename.toLowerCase();
  for (const [key, slug] of Object.entries(SUBJECT_MAP)) {
    if (lowerName.includes(key)) { subjectSlug = slug; break; }
  }
  if (!subjectSlug) subjectSlug = 'mathematiques'; // default

  // Determine class from filename
  let classSlug = null;
  for (const [key, slug] of Object.entries(CLASS_MAP)) {
    if (lowerName.includes(key.toLowerCase())) { classSlug = slug; break; }
  }
  if (!classSlug) classSlug = '9eme';

  // Determine resource type from title/filename
  let type = 'COURSE';
  if (lowerName.includes('devoir') || lowerName.includes('controle') || lowerName.includes('synthese')) type = 'HOMEWORK';
  else if (lowerName.includes('exercice') || lowerName.includes('série') || lowerName.includes('serie')) type = 'EXERCISE';
  else if (lowerName.includes('examen')) type = 'EXAM';
  else if (lowerName.includes('corrig')) type = 'CORRECTION';
  else if (lowerName.includes('revision') || lowerName.includes('révision')) type = 'REVISION';
  else if (lowerName.includes('cours')) type = 'COURSE';

  // Extract year (2012-2013, 2022-2023, etc.)
  const yearMatch = filename.match(/(\d{4})[\-_](\d{4})/);
  const year = yearMatch ? `${yearMatch[1]}-${yearMatch[2]}` : '2024-2025';

  // Build multipart body
  // NOTE: Attribution is automatic via the teacher account, so no
  // need to embed teacher/source info in the title or description.
  const parts = [];
  const fields = {
    title: file.title
      .replace(/\s*Mr\s+\w+(\s+\w+)?\.?$/i, '')
      .replace(/\.pdf$/i, '')
      .replace(/\s*-\s*(Mr\s+)?Gharbi\s+Ridha\s*$/i, '')
      .replace(/\s*-\s*(Mr\s+)?GHARBI\s+RIDHA\s*$/i, '')
      .trim() + ` (${year})`,
    description: '', // Empty - attribution via teacher account
    type,
    subject: subjectSlug,
    class: classSlug,
    year,
    tags: `import,${file.teacher.toLowerCase().replace(/\s+/g, '-')},tunisiecollege,${type.toLowerCase()}`
  };

  for (const [name, value] of Object.entries(fields)) {
    parts.push(
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="${name}"\r\n\r\n` +
      `${value}\r\n`
    );
  }

  parts.push(
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="file"; filename="${filename}"\r\n` +
    `Content-Type: application/pdf\r\n\r\n`
  );

  const bodyStart = Buffer.from(parts.join(''), 'utf8');
  const bodyEnd = Buffer.from(`\r\n--${boundary}--\r\n`, 'utf8');
  const body = Buffer.concat([bodyStart, buffer, bodyEnd]);

  const res = await makeRequest(`${BASE_URL}/api/teacher/resources`, {
    method: 'POST',
    headers: {
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
      'Content-Length': body.length,
      'Cookie': session.cookie,
    }
  }, body);

  const data = res.json();
  if (!res.status.toString().startsWith('2')) {
    throw new Error(`Upload failed: ${res.status} ${JSON.stringify(data)}`);
  }

  return data;
}

async function approve(session, resourceId) {
  const res = await makeRequest(`${BASE_URL}/api/admin/resource/${resourceId}/approve`, {
    method: 'POST',
    headers: { 'Cookie': session.cookie }
  });

  const data = res.json();
  if (!res.status.toString().startsWith('2')) {
    throw new Error(`Approve failed: ${res.status} ${JSON.stringify(data)}`);
  }
  return data;
}

async function main() {
  const manifestPath = process.argv[2];
  if (!manifestPath) {
    console.error('Usage: node upload-to-examanet.js <manifest.json>');
    process.exit(1);
  }

  if (!fs.existsSync(manifestPath)) {
    console.error(`Manifest not found: ${manifestPath}`);
    process.exit(1);
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  console.log(`Found ${manifest.length} files in manifest`);
  console.log(`Base URL: ${BASE_URL}`);
  console.log('');

  // Login as admin (so we can auto-approve)
  const session = await login(ADMIN_EMAIL, ADMIN_PASSWORD);
  console.log(`Logged in as ${session.user.email}`);
  console.log('');

  let success = 0, failed = 0;

  for (let i = 0; i < manifest.length; i++) {
    const file = manifest[i];
    process.stdout.write(`[${i + 1}/${manifest.length}] ${file.title.slice(0, 50)}... `);
    try {
      // Upload
      const uploadRes = await uploadOne(session, file);
      const resourceId = uploadRes.resource?.id;
      if (!resourceId) throw new Error('No resource ID in response');

      // Auto-approve (since admin is uploading)
      try {
        await approve(session, resourceId);
        console.log(`✓ Uploaded + approved (${resourceId.slice(0, 8)})`);
      } catch {
        console.log(`✓ Uploaded, awaiting approval (${resourceId.slice(0, 8)})`);
      }
      success++;
    } catch (e) {
      console.log(`✗ ${e.message.slice(0, 100)}`);
      failed++;
    }

    if (i < manifest.length - 1) await new Promise(r => setTimeout(r, 1000));
  }

  console.log('');
  console.log('═══════════════════════════════════════════════');
  console.log(`✓ Success: ${success}`);
  console.log(`✗ Failed:  ${failed}`);
  console.log(`📊 Total:   ${manifest.length}`);
  console.log('═══════════════════════════════════════════════');
}

main().catch(e => {
  console.error('Fatal error:', e);
  process.exit(1);
});