#!/usr/bin/env python3
"""OCR v4: Retry the 10 fails from v3 + remaining <500c college files.
Use the proven node + iLovePDF approach.
"""
import os, json, re, subprocess, urllib.request, time
import importlib.util

spec = importlib.util.spec_from_file_location('m', 'pdf-test/bulk_math_v5.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)

PUB_KEY = 'project_public_d1448365692fd5dee0aa5e617dc877a3_oZ7Rs0e163492d3ce295974b66731db65ce9c'
SEC_KEY = 'secret_key_5090a237520cd8bf28007277b0a8eaae_wePIX80644e3e7875908c7d17221d417f8cf5'
TOKEN = 'devmanet-bulk-2026'
PROXY = 'https://examanet.com/api/blob-teacher'

PROGRESS = '/workspace/edutunisie/pdf-test/ocr_v4_progress.json'
done = {}
if os.path.exists(PROGRESS):
    with open(PROGRESS) as f: done = json.load(f)

# Get all <500c college resources
r = m.neon_query('''
SELECT r.id, r."numericId", r.language, c.slug, s.slug, tf."fileKey"
FROM "Resource" r
JOIN "Class" c ON c.id = r."classId"
LEFT JOIN "Subject" s ON s.id = r."subjectId"
LEFT JOIN "ResourceContent" rc ON rc."resourceId" = r.id
LEFT JOIN "TeacherFile" tf ON tf."resourceId" = r.id
WHERE c.slug IN ('7eme', '8eme', '9eme') 
AND LENGTH(rc."fullText") < 500
''')
targets = []
for row in r.get('response', [{}])[0].get('data', {}).get('rows', []):
    if not row[5]:
        continue
    targets.append({
        'id': row[0], 'nid': row[1], 'lang': str(row[2]), 
        'cls': str(row[3]), 'subj': str(row[4]), 'fileKey': str(row[5])
    })

print(f'Total: {len(targets)}', flush=True)

def download_pdf(file_key):
    url = f'{PROXY}/{file_key}'
    req = urllib.request.Request(url, headers={'X-Internal-Token': TOKEN})
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            return resp.read()
    except:
        return None

def ocr_pdf(pdf_bytes, langs, retries=2):
    tmp_in = '/tmp/ocr_in.pdf'
    tmp_out = '/tmp/ocr_out.pdf'
    with open(tmp_in, 'wb') as f:
        f.write(pdf_bytes)
    
    for attempt in range(retries):
        try:
            result = subprocess.run(
                ['node', '/workspace/edutunisie/pdf-test/ilove_ocr.js', 
                 PUB_KEY, SEC_KEY, tmp_in, tmp_out, ','.join(langs)],
                capture_output=True, text=True, timeout=300
            )
            if result.returncode == 0:
                with open(tmp_out, 'rb') as f:
                    return f.read(), None
        except:
            pass
        time.sleep(5)
    return None, 'OCR failed'

def extract_text(pdf_bytes):
    import fitz
    try:
        doc = fitz.open(stream=pdf_bytes, filetype='pdf')
        text = ''
        for page in doc:
            text += page.get_text() + '\n'
        return text.strip()
    except:
        return ''

ok = 0
fail = 0
start = time.time()
for i, t in enumerate(targets):
    nid_s = str(t['nid'])
    if done.get(nid_s) and done[nid_s].startswith('ok'):
        continue
    
    print(f'[{i+1}/{len(targets)}] NID {t["nid"]} ({t["lang"]}/{t["cls"]})...', flush=True, end=' ')
    
    pdf = download_pdf(t['fileKey'])
    if not pdf:
        done[nid_s] = 'fail:download'
        fail += 1
        print('FAIL: download')
        continue
    
    langs = ['ara', 'fra'] if t['lang'] == 'ar' else ['fra', 'ara']
    ocr_bytes, err = ocr_pdf(pdf, langs)
    if err:
        done[nid_s] = 'fail:ocr'
        fail += 1
        print(f'FAIL: OCR')
        continue
    
    new_text = extract_text(ocr_bytes)
    if not new_text or len(new_text) < 50:
        done[nid_s] = f'fail:extract:{len(new_text) if new_text else 0}'
        fail += 1
        print(f'FAIL: extract ({len(new_text) if new_text else 0}c)')
        continue
    
    new_text_clean = re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]', '', new_text)
    new_text_sql = new_text_clean.replace("'", "''")
    
    m.neon_query(f'''UPDATE "ResourceContent" SET "fullText" = '{new_text_sql}' 
                    WHERE "resourceId" = '{t["id"]}' ''')
    
    done[nid_s] = f'ok:{len(new_text)}'
    ok += 1
    print(f'OK ({len(new_text)}c)')
    
    if (i+1) % 3 == 0:
        with open(PROGRESS, 'w') as f: json.dump(done, f)

with open(PROGRESS, 'w') as f: json.dump(done, f)
print(f'\nDone: {ok} OK, {fail} FAIL in {time.time()-start:.0f}s')
