import fs from 'fs';

const PUBLIC_KEY = 'project_public_d1448365692fd5dee0aa5e617dc877a3_oZ7Rs0e163492d3ce295974b66731db65ce9c';
const API_BASE = 'https://api.ilovepdf.com';

let token;

async function auth() {
  const r = await fetch(`${API_BASE}/v1/auth`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ public_key: PUBLIC_KEY })
  });
  return (await r.json()).token;
}

async function startTask(tool = 'officepdf') {
  const r = await fetch(`${API_BASE}/v1/start/${tool}`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  const d = await r.json();
  return { server: d.server, task: d.task };
}

async function uploadFile(server, taskId, fileBuffer, filename) {
  const FormData = (await import('form-data')).default;
  const fd = new FormData();
  fd.append('task', taskId);
  fd.append('file', fileBuffer, { filename });
  const r = await fetch(`https://${server}/v1/upload`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, ...fd.getHeaders() },
    body: fd.getBuffer()
  });
  return (await r.json()).server_filename;
}

async function process(server, taskId, serverFile, filename) {
  const r = await fetch(`https://${server}/v1/process`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      task: taskId,
      files: [{ server_filename: serverFile, filename }],
      tool: 'officepdf'
    })
  });
  return r.json();
}

async function download(server, taskId) {
  const r = await fetch(`https://${server}/v1/download/${taskId}`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  if (!r.ok) throw new Error(`Download failed: ${r.status}`);
  return Buffer.from(await r.arrayBuffer());
}

// Test
async function testConvert(filepath, outPath) {
  if (!token) token = await auth();
  const filename = filepath.split('/').pop();
  const buffer = fs.readFileSync(filepath);
  
  const { server, task } = await startTask();
  console.log(`  Task started: ${task.substring(0, 30)}`);
  
  const serverFile = await uploadFile(server, task, buffer, filename);
  console.log(`  Uploaded: ${serverFile.substring(0, 30)}...`);
  
  const proc = await process(server, task, serverFile, filename);
  console.log(`  Process result:`, proc.status, proc.error || '');
  
  if (proc.status === 'TaskSuccess') {
    const pdf = await download(server, task);
    fs.writeFileSync(outPath, pdf);
    console.log(`  Downloaded: ${pdf.length} bytes`);
    return pdf.length;
  }
  return 0;
}

(async () => {
  console.log('=== iLovePDF conversion test ===\n');
  console.log('Testing on test.docx...');
  const size = await testConvert(
    '/workspace/docs/devoirat/pilot/downloads/test.docx',
    '/workspace/docs/devoirat/pilot/downloads/test-converted.pdf'
  );
  console.log(`\nFinal size: ${size} bytes`);
  const head = fs.readFileSync('/workspace/docs/devoirat/pilot/downloads/test-converted.pdf').slice(0, 4);
  console.log(`Is valid PDF: ${head.toString() === '%PDF'}`);
})();
