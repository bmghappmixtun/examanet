#!/usr/bin/env python3
"""iLovePDF pdfocr pipeline for 52 remaining files.
4 workers parallel - downloads, iLovePDF pdfocr, extracts text, updates DB.
"""
import os, json, re, time, requests, subprocess
import importlib.util
import fitz
from concurrent.futures import ThreadPoolExecutor, as_completed
from openai import OpenAI

spec = importlib.util.spec_from_file_location('m', 'pdf-test/bulk_math_v5.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
client = OpenAI()

PUB_KEY = 'project_public_d1448365692fd5dee0aa5e617dc877a3_oZ7Rs0e163492d3ce295974b66731db65ce9c'
SEC_KEY = 'secret_key_5090a237520cd8bf28007277b0a8eaae_wePIX80644e3e7875908c7d17221d417f8cf5'
TOKEN = 'devmanet-bulk-2026'
PROXY = 'https://examanet.com/api/blob-teacher'
TARGETS = '/tmp/ilove_52_targets.json'
PROGRESS = '/workspace/edutunisie/pdf-test/ilove_52_progress.json'

WORKER_SCRIPT = '''
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
  await task.start();
  await task.addFile(new ILovePDFFile(pdfPath));
  await task.process({ ocr_languages: langs });
  const data = await task.download();
  fs.writeFileSync(outPath, data);
  console.log('OK:' + data.length);
}
main().catch(e => { console.error('ERR:' + e.message); process.exit(1); });
'''

def download(file_key):
    url = f'{PROXY}/{file_key}'
    r = requests.get(url, headers={'X-Internal-Token': TOKEN}, timeout=60)
    if r.status_code != 200: return None
    return r.content

def ilove_ocr(pdf_bytes, out_path):
    """Run iLovePDF pdfocr via Node.js helper."""
    tmp_in = out_path + '.in.pdf'
    with open(tmp_in, 'wb') as f: f.write(pdf_bytes)
    res = subprocess.run(
        ['node', '/workspace/edutunisie/pdf-test/ilove_ocr.js', PUB_KEY, SEC_KEY, tmp_in, out_path, 'fra,eng'],
        capture_output=True, text=True, timeout=180
    )
    os.remove(tmp_in)
    if res.returncode != 0 or not os.path.exists(out_path):
        return False
    return True

def extract_text(pdf_path):
    doc = fitz.open(pdf_path)
    text = ''
    for page in doc:
        text += page.get_text() + '\n'
    doc.close()
    return text.strip()

def gen_ai_desc(text, title, subject):
    text_sample = text[:3000] if len(text) > 3000 else text
    prompt = f"""Assistant éducatif tunisien. Génère une description concise en français de 2-3 phrases pour cette ressource scolaire.

Titre: {title}
Matière: {subject}

Contenu:
\"\"\"
{text_sample}
\"\"\"

Description de 2-3 phrases (150-300 caractères) expliquant le contenu, concepts clés, et utilité.
Réponds UNIQUEMENT la description, sans préambule."""
    try:
        resp = client.chat.completions.create(
            model='gpt-4o-mini',
            messages=[{'role': 'user', 'content': prompt}],
            max_tokens=200, temperature=0.3, timeout=30,
        )
        return resp.choices[0].message.content.strip()
    except: return None

def gen_meta(desc):
    if not desc: return None
    for i, c in enumerate(desc):
        if c in '.!?' and i > 50: return desc[:i+1][:155]
    return desc[:155]

def update_db(rid, fulltext, desc, meta):
    fulltext_clean = re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]', '', fulltext).replace("'", "''")
    desc_clean = re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]', '', desc).replace("'", "''")
    meta_clean = re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]', '', meta or '').replace("'", "''")
    sql = f"""
    UPDATE "ResourceContent" SET "fullText" = $${fulltext_clean}$$ WHERE "resourceId" = '{rid}';
    UPDATE "Resource" SET description = $${desc_clean}$$, "metaDescription" = $${meta_clean}$$, "descriptionGeneratedAt" = NOW(), "descriptionSource" = 'ilovepdf-pdfocr-2026-07' WHERE id = '{rid}';
    """
    return m.neon_query(sql)

# Load targets
with open(TARGETS) as f:
    targets = json.load(f)

# Load progress
done = {}
if os.path.exists(PROGRESS):
    with open(PROGRESS) as f: done = json.load(f)

def process(t):
    nid = str(t['nid'])
    if done.get(nid) == 'ok': return nid, 'skip', None
    
    work_dir = f'/tmp/ilove52/{nid}'
    os.makedirs(work_dir, exist_ok=True)
    
    # 1. Download
    pdf_bytes = download(t['fileKey'])
    if not pdf_bytes:
        return nid, 'dl_fail', None
    
    # 2. iLovePDF
    out_pdf = f'{work_dir}/ocr.pdf'
    if not ilove_ocr(pdf_bytes, out_pdf):
        return nid, 'ilove_fail', None
    
    # 3. Extract text
    text = extract_text(out_pdf)
    if len(text) < 200:
        return nid, 'short_text', len(text)
    
    # 4. AI desc
    desc = gen_ai_desc(text, t['title'], t['subject'])
    if not desc:
        return nid, 'gpt_fail', None
    meta = gen_meta(desc)
    
    # 5. Update DB
    try:
        update_db(t['id'], text, desc, meta)
        return nid, 'ok', len(text)
    except Exception as e:
        return nid, f'db_fail:{str(e)[:30]}', None

start = time.time()
ok = 0
fail = 0
processed = 0

with ThreadPoolExecutor(max_workers=4) as ex:
    futures = {ex.submit(process, t): t for t in targets if str(t['nid']) not in done or done[str(t['nid'])] != 'ok'}
    print(f'Queue: {len(futures)}', flush=True)
    for fut in as_completed(futures):
        nid, status, info = fut.result()
        processed += 1
        if status == 'ok':
            ok += 1
            done[nid] = 'ok'
        else:
            fail += 1
            done[nid] = status
            print(f'  NID {nid}: {status} {info}', flush=True)
        if processed % 4 == 0:
            elapsed = time.time() - start
            rate = processed / elapsed if elapsed > 0 else 0
            remaining = len(futures) - processed
            eta = remaining / rate / 4 if rate > 0 else 0  # divide by 4 because parallel
            print(f'[{processed}/{len(futures)}] OK:{ok} FAIL:{fail} {rate:.1f}/s ETA {eta/60:.0f}min', flush=True)
            with open(PROGRESS, 'w') as f: json.dump(done, f)

with open(PROGRESS, 'w') as f: json.dump(done, f)
print(f'\nFinal: {ok} OK, {fail} fail')
