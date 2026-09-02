#!/usr/bin/env python3
"""OCR pour les 111 fichiers collège avec texte pauvre (100-500c)."""
import os, json, re, subprocess, requests
import importlib.util
spec = importlib.util.spec_from_file_location('m', 'pdf-test/bulk_math_v5.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)

PUB_KEY = 'project_public_d1448365692fd5dee0aa5e617dc877a3_oZ7Rs0e163492d3ce295974b66731db65ce9c'
SEC_KEY = 'secret_key_5090a237520cd8bf28007277b0a8eaae_wePIX80644e3e7875908c7d17221d417f8cf5'
TOKEN = 'devmanet-bulk-2026'
PROXY = 'https://examanet.com/api/blob-teacher'

PROGRESS = '/workspace/edutunisie/pdf-test/ocr_college_progress.json'
done = {}
if os.path.exists(PROGRESS):
    with open(PROGRESS) as f: done = json.load(f)

with open('pdf-test/ocr_targets.json', 'r', encoding='utf-8') as f:
    targets = json.load(f)

print(f'Total: {len(targets)}', flush=True)

def download_pdf(file_key):
    """Download via Vercel proxy."""
    url = f'{PROXY}/{file_key}'
    headers = {'X-Internal-Token': TOKEN}
    r = requests.get(url, headers=headers, timeout=60)
    if r.status_code == 200:
        return r.content
    return None

def ocr_pdf(pdf_bytes, langs):
    """Run iLovePDF pdfocr."""
    tmp_in = '/tmp/ocr_in.pdf'
    tmp_out = '/tmp/ocr_out.pdf'
    with open(tmp_in, 'wb') as f:
        f.write(pdf_bytes)
    
    result = subprocess.run(
        ['node', '/workspace/edutunisie/pdf-test/ilove_ocr.js', PUB_KEY, SEC_KEY, tmp_in, tmp_out, ','.join(langs)],
        capture_output=True, text=True, timeout=180
    )
    if result.returncode != 0:
        return None, f'Node error: {result.stderr}'
    
    with open(tmp_out, 'rb') as f:
        return f.read(), None

def extract_text_from_pdf(pdf_bytes):
    """Extract text using pdfplumber/pymupdf."""
    try:
        import fitz
        doc = fitz.open(stream=pdf_bytes, filetype='pdf')
        text = ''
        for page in doc:
            text += page.get_text() + '\n'
        return text.strip()
    except Exception as e:
        return None

# Process
ok = 0
fail = 0
skip = 0
for i, t in enumerate(targets):
    nid_s = str(t['nid'])
    if done.get(nid_s) == 'ok':
        skip += 1
        continue
    
    try:
        # Download
        pdf = download_pdf(t['fileKey'])
        if not pdf:
            done[nid_s] = 'fail:download'
            fail += 1
            continue
        
        # OCR
        langs = ['fra', 'eng'] if t['lang'] == 'fr' else ['ara', 'fra']
        ocr_pdf_bytes, err = ocr_pdf(pdf, langs)
        if err:
            done[nid_s] = f'fail:ocr:{err[:30]}'
            fail += 1
            continue
        
        # Extract text
        new_text = extract_text_from_pdf(ocr_pdf_bytes)
        if not new_text:
            done[nid_s] = 'fail:extract'
            fail += 1
            continue
        
        # Sanitize and save
        new_text_clean = re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]', '', new_text)
        new_text_sql = new_text_clean.replace("'", "''")
        
        m.neon_query(f'''UPDATE "ResourceContent" SET "fullText" = '{new_text_sql}' 
                        WHERE "resourceId" = (SELECT id FROM "Resource" WHERE "numericId" = {t['nid']})''')
        
        done[nid_s] = f'ok:{len(new_text)}'
        ok += 1
        print(f'[{i+1}/{len(targets)}] NID {t["nid"]} OK ({len(new_text)}c)', flush=True)
        
    except Exception as e:
        done[nid_s] = f'fail:{str(e)[:50]}'
        fail += 1
        print(f'[{i+1}/{len(targets)}] NID {t["nid"]} FAIL: {str(e)[:50]}', flush=True)
    
    if (i+1) % 5 == 0:
        with open(PROGRESS, 'w') as f: json.dump(done, f)

with open(PROGRESS, 'w') as f: json.dump(done, f)
print(f'\nDone: {ok} OK, {fail} FAIL, {skip} SKIP')
