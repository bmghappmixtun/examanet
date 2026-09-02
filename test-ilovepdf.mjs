import fs from 'fs';

const PUBLIC_KEY = 'project_public_d1448365692fd5dee0aa5e617dc877a3_oZ7Rs0e163492d3ce295974b66731db65ce9c';

async function auth() {
  const r = await fetch('https://api.ilovepdf.com/v1/auth', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ public_key: PUBLIC_KEY })
  });
  return (await r.json()).token;
}

async function startTask(token, tool) {
  const r = await fetch('https://api.ilovepdf.com/v1/start/' + tool, {
    headers: { 'Authorization': 'Bearer ' + token }
  });
  const d = await r.json();
  return { server: d.server, task: d.task };
}

async function uploadFile(server, token, taskId, filePath) {
  const buffer = fs.readFileSync(filePath);
  const filename = filePath.split('/').pop();
  const FormData = (await import('form-data')).default;
  const fd = new FormData();
  fd.append('task', taskId);
  fd.append('file', buffer, { filename });
  const r = await fetch(`https://${server}/v1/upload`, {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + token, ...fd.getHeaders() },
    body: fd.getBuffer()
  });
  const data = await r.json();
  return { server_filename: data.server_filename, filename };
}

async function processTask(server, token, taskId, serverFile, originalFilename) {
  const r = await fetch(`https://${server}/v1/process`, {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      task: taskId,
      files: [{ server_filename: serverFile, filename: originalFilename }],
      tool: 'officepdf'
    })
  });
  return r.json();
}

async function downloadResult(server, token, taskId, outputPath) {
  const r = await fetch(`https://${server}/v1/download/task/${taskId}`, {
    headers: { 'Authorization': 'Bearer ' + token }
  });
  const buf = Buffer.from(await r.arrayBuffer());
  fs.writeFileSync(outputPath, buf);
  return buf.length;
}

(async () => {
  try {
    console.log('1. Auth');
    const token = await auth();
    
    console.log('2. Start task officepdf');
    const { server, task } = await startTask(token, 'officepdf');
    console.log('   Server:', server);
    
    console.log('3. Upload test.docx');
    const upload = await uploadFile(server, token, task, '/workspace/docs/devoirat/pilot/downloads/test.docx');
    console.log('   Server filename:', upload.server_filename);
    
    console.log('4. Process');
    const proc = await processTask(server, token, task, upload.server_filename, upload.filename);
    console.log('   Result:', JSON.stringify(proc));
    
    if (!proc.error) {
      console.log('5. Download');
      const size = await downloadResult(server, token, task, '/workspace/docs/devoirat/pilot/downloads/test-converted.pdf');
      console.log(`   Downloaded: ${size} bytes`);
      
      const head = fs.readFileSync('/workspace/docs/devoirat/pilot/downloads/test-converted.pdf').slice(0, 4);
      console.log('   First 4 bytes:', head.toString('hex'), '(25504446 = %PDF OK)');
    }
  } catch (e) {
    console.error('Error:', e.message);
  }
})();
