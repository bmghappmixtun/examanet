#!/usr/bin/env python3
"""Try Tesseract on the remaining <200c college files."""
import os, json, re, subprocess, urllib.request, time
import importlib.util

spec = importlib.util.spec_from_file_location('m', 'pdf-test/bulk_math_v5.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)

TOKEN = 'devmanet-bulk-2026'
PROXY = 'https://examanet.com/api/blob-teacher'

PROGRESS = '/workspace/edutunisie/pdf-test/tesseract_progress.json'
done = {}
if os.path.exists(PROGRESS):
    with open(PROGRESS) as f: done = json.load(f)

# Get remaining <200c
r = m.neon_query('''
SELECT r.id, r."numericId", r.language, tf."fileKey"
FROM "Resource" r
JOIN "Class" c ON c.id = r."classId"
LEFT JOIN "ResourceContent" rc ON rc."resourceId" = r.id
LEFT JOIN "TeacherFile" tf ON tf."resourceId" = r.id
WHERE c.slug IN ('7eme', '8eme', '9eme') 
AND LENGTH(rc."fullText") < 200
AND tf."fileKey" IS NOT NULL
''')
targets = [{'id': row[0], 'nid': row[1], 'lang': str(row[2]), 'fileKey': str(row[3])} 
           for row in r.get('response', [{}])[0].get('data', {}).get('rows', [])]
print(f'Targets: {len(targets)}', flush=True)

def download_pdf(file_key):
    url = f'{PROXY}/{file_key}'
    req = urllib.request.Request(url, headers={'X-Internal-Token': TOKEN})
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            return resp.read()
    except:
        return None

def tesseract_ocr(pdf_bytes, lang='ara+fra'):
    """Use Tesseract directly on PDF pages (rendered as images)."""
    import fitz
    try:
        doc = fitz.open(stream=pdf_bytes, filetype='pdf')
        text = ''
        for i, page in enumerate(doc):
            if i >= 5:  # Limit to 5 pages
                break
            pix = page.get_pixmap(dpi=200)
            img_path = f'/tmp/ocr_p{i}.png'
            pix.save(img_path)
            
            result = subprocess.run(
                ['tesseract', img_path, '-', '-l', lang, '--psm', '6'],
                capture_output=True, text=True, timeout=60
            )
            if result.returncode == 0:
                text += result.stdout + '\n'
            
            os.remove(img_path)
        return text.strip()
    except Exception as e:
        return f''

ok = 0
fail = 0
start = time.time()
for i, t in enumerate(targets):
    nid_s = str(t['nid'])
    if done.get(nid_s) and done[nid_s].startswith('ok'):
        continue
    
    pdf = download_pdf(t['fileKey'])
    if not pdf:
        done[nid_s] = 'fail:download'
        fail += 1
        continue
    
    lang = 'ara+fra' if t['lang'] == 'ar' else 'fra'
    new_text = tesseract_ocr(pdf, lang)
    
    if not new_text or len(new_text) < 50:
        done[nid_s] = f'fail:extract:{len(new_text) if new_text else 0}'
        fail += 1
        print(f'  NID {t["nid"]}: FAIL ({len(new_text) if new_text else 0}c)')
        continue
    
    new_text_clean = re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]', '', new_text)
    new_text_sql = new_text_clean.replace("'", "''")
    
    m.neon_query(f'''UPDATE "ResourceContent" SET "fullText" = '{new_text_sql}' 
                    WHERE "resourceId" = '{t["id"]}' ''')
    
    done[nid_s] = f'ok:{len(new_text)}'
    ok += 1
    print(f'  NID {t["nid"]}: OK ({len(new_text)}c)')
    
    if (i+1) % 3 == 0:
        with open(PROGRESS, 'w') as f: json.dump(done, f)

with open(PROGRESS, 'w') as f: json.dump(done, f)
print(f'\nDone: {ok} OK, {fail} FAIL in {time.time()-start:.0f}s')
