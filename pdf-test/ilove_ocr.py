#!/usr/bin/env python3
"""Use iLovePDF pdfocr tool via Node.js SDK to OCR the broken PDFs."""
import os, json, subprocess, urllib.request, importlib.util
import sys

spec = importlib.util.spec_from_file_location('bulk_math_v5', '/workspace/edutunisie/pdf-test/bulk_math_v5.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)

# Get the keys from the admin API
SEED = os.environ.get('SEED_TOKEN') or open('/workspace/edutunisie/.env').read().split('SEED_TOKEN=')[1].split('\n')[0].strip('"')

# Use the existing admin API to get the keys (need to call Node API)
# The simpler way: call the existing iloveapi.ts from Node.js
NODE_SCRIPT = '''
const path = require('path');
process.chdir('/workspace/edutunisie');
require('dotenv').config({ path: '/workspace/edutunisie/.env' });
const { ILovePDFApi } = require('@ilovepdf/ilovepdf-nodejs');
const ILovePDFFile = require('@ilovepdf/ilovepdf-nodejs/ILovePDFFile').default;
const fs = require('fs');

async function process(pdfPath, outputPath, langs) {
  const publicKey = process.env.I_LOVE_API_PUBLIC_KEY;
  const secretKey = process.env.I_LOVE_API_SECRET_KEY;
  if (!publicKey || !secretKey) {
    console.error('NO_KEYS');
    return;
  }
  const api = new ILovePDFApi(publicKey, secretKey);
  const task = api.newTask('pdfocr');
  await task.start();
  const file = new ILovePDFFile(pdfPath);
  await task.addFile(file);
  await task.process({ ocr_languages: langs });
  const data = await task.download();
  fs.writeFileSync(outputPath, data);
  console.log('OK:' + outputPath + ':' + data.length);
}

const args = process.argv.slice(2);
process(args[0], args[1], args[2].split(','))
  .catch(e => { console.error('ERR:' + e.message); process.exit(1); });
'''

# Write the node helper script
with open('/tmp/ilove_ocr.js', 'w') as f:
    f.write(NODE_SCRIPT)

# Now process the broken PDFs
NIDS = [4220, 4797, 6273, 6938, 9264, 11313, 11510, 11533, 11534, 11650, 11661, 11674, 11687, 12338, 12475, 12826, 12990, 15070]
PROGRESS_FILE = '/workspace/edutunisie/pdf-test/ilove_ocr_progress.json'

# Get targets
r = m.neon_query(f'''
SELECT r.id, r."numericId", r."fileKey", s.slug as subject
FROM "Resource" r
JOIN "Subject" s ON s.id = r."subjectId"
WHERE r."numericId" IN ({','.join(str(n) for n in NIDS)})
''')
rows = r.get('response', [{}])[0].get('data', {}).get('rows', [])
targets = [{'id': r[0], 'numericId': r[1], 'fileKey': r[2], 'subject': r[3]} for r in rows]

progress = {'done': [], 'ok': [], 'errors': {}}
if os.path.exists(PROGRESS_FILE):
    with open(PROGRESS_FILE) as f:
        progress = json.load(f)

done_set = set(progress['done'])
todo = [t for t in targets if t['numericId'] not in done_set]
print(f'Total: {len(targets)}, remaining: {len(todo)}')

# Choose languages
for i, t in enumerate(todo):
    pdf_path = f'/tmp/ilove_in_{t["numericId"]}.pdf'
    out_path = f'/tmp/ilove_out_{t["numericId"]}.pdf'
    
    # Download PDF
    try:
        url = f'https://examanet.com/api/blob-teacher/{t["fileKey"]}'
        req = urllib.request.Request(url, headers={'X-Internal-Token': 'devmanet-bulk-2026'})
        with urllib.request.urlopen(req, timeout=30) as resp:
            with open(pdf_path, 'wb') as f:
                f.write(resp.read())
    except Exception as e:
        progress['done'].append(t['numericId'])
        progress['errors'][str(t['numericId'])] = f'dl:{str(e)[:40]}'
        print(f'  [{i+1}/{len(todo)}] NID {t["numericId"]}: download error')
        continue
    
    # Choose langs
    if t['subject'] in ('arabe', 'education-islamique', 'education-civique'):
        langs = 'ara,fra'
    else:
        langs = 'fra,eng'
    
    # Call Node.js helper
    result = subprocess.run(
        ['node', '/tmp/ilove_ocr.js', pdf_path, out_path, langs],
        capture_output=True, text=True, timeout=120
    )
    
    progress['done'].append(t['numericId'])
    if 'OK:' in result.stdout and os.path.exists(out_path):
        size = os.path.getsize(out_path)
        progress['ok'].append({'nid': t['numericId'], 'size': size, 'langs': langs})
        print(f'  [{i+1}/{len(todo)}] NID {t["numericId"]}: OK ({size}b, {langs})')
    else:
        err = result.stderr[:100] if result.stderr else result.stdout[:100]
        progress['errors'][str(t['numericId'])] = f'api:{err}'
        print(f'  [{i+1}/{len(todo)}] NID {t["numericId"]}: API error {err[:60]}')
    
    # Clean up
    for p in [pdf_path, out_path]:
        if os.path.exists(p):
            os.remove(p)
    
    with open(PROGRESS_FILE, 'w') as f:
        json.dump(progress, f, default=str)

print(f'\nFinal: {len(progress["ok"])} recovered, {len(progress["errors"])} failed')
