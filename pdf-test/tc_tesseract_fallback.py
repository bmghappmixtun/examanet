#!/usr/bin/env python3
"""Tesseract fallback for the 18 TC.net PDFs that couldn't be matched."""
import os, json, re, urllib.request, importlib.util
import fitz
import pytesseract
from PIL import Image
import io

spec = importlib.util.spec_from_file_location('bulk_math_v5', '/workspace/edutunisie/pdf-test/bulk_math_v5.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)

PROGRESS_FILE = '/workspace/edutunisie/pdf-test/tc_tesseract_progress.json'

def extract_with_tesseract(pdf_bytes):
    """Try tesseract with multiple PSM modes."""
    try:
        doc = fitz.open(stream=pdf_bytes, filetype='pdf')
        total_text = ''
        for page in doc:
            pix = page.get_pixmap(dpi=200)
            img = Image.open(io.BytesIO(pix.tobytes('png')))
            for psm in [3, 6, 4, 11]:
                try:
                    text = pytesseract.image_to_string(img, lang='ara+fra', config=f'--oem 1 --psm {psm}')
                    if text and len(text) > len(total_text):
                        total_text = text
                except:
                    continue
        doc.close()
        return total_text.strip(), None
    except Exception as e:
        return None, str(e)

def upload_to_blob(resource_id, pdf_bytes):
    seed_token = os.environ.get('SEED_TOKEN') or open('/workspace/edutunisie/.env').read().split('SEED_TOKEN=')[1].split('\n')[0].strip('"')
    url = 'https://examanet.com/api/admin/resource-overwrite'
    boundary = '----WebKitFormBoundary7MA4YWxkTrZu0gW'
    crlf = b'\r\n'
    parts = [
        b'--' + boundary.encode(),
        b'Content-Disposition: form-data; name="resourceId"',
        b'',
        resource_id.encode(),
        b'--' + boundary.encode(),
        b'Content-Disposition: form-data; name="file"; filename="tesseract-recovered.pdf"',
        b'Content-Type: application/pdf',
        b'',
        pdf_bytes,
        b'--' + boundary.encode() + b'--',
        b'',
    ]
    data = crlf.join(parts)
    req = urllib.request.Request(url, data=data, headers={
        'X-Seed-Token': seed_token,
        'Content-Type': f'multipart/form-data; boundary={boundary}',
    })
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return json.loads(r.read()), None
    except urllib.error.HTTPError as e:
        return None, f'HTTP {e.code}'
    except Exception as e:
        return None, str(e)

def update_content(rid, text):
    text_clean = re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]', '', text)
    wc = len(text_clean.split())
    sql = f'''
    INSERT INTO "ResourceContent" ("id", "resourceId", "fullText", "extractionMethod", "extractedAt", "wordCount")
    VALUES (gen_random_uuid()::text, $${rid}$$, $${text_clean}$$, 'tesseract-fallback', NOW(), {wc})
    ON CONFLICT ("resourceId") DO UPDATE SET
      "fullText" = EXCLUDED."fullText",
      "extractionMethod" = EXCLUDED."extractionMethod",
      "extractedAt" = NOW(),
      "wordCount" = EXCLUDED."wordCount"
    '''
    return m.neon_query(sql)

def get_targets():
    r = m.neon_query('''
    SELECT r.id, r."numericId", r."fileKey", r.title
    FROM "Resource" r
    LEFT JOIN "ResourceContent" rc ON rc."resourceId" = r.id
    WHERE r."importedFrom" = 'tunisiecollege.net'
      AND (
        r.id NOT IN (SELECT "resourceId" FROM "ResourceContent" WHERE "resourceId" IS NOT NULL)
        OR LENGTH(COALESCE(rc."fullText", '')) < 100
        OR rc."fullText" ILIKE '%unable to extract%'
        OR rc."fullText" ILIKE '%sorry, but i can%'
        OR rc."fullText" ILIKE '%i can''t assist%'
        OR rc."fullText" ILIKE '%i cannot extract%'
      )
    ORDER BY r."numericId"
    ''')
    rows = r.get('response', [{}])[0].get('data', {}).get('rows', [])
    return [{'id': r[0], 'numericId': r[1], 'fileKey': r[2], 'title': r[3]} for r in rows]

def main():
    targets = get_targets()
    print(f'Total targets: {len(targets)}')
    
    progress = {'done': [], 'ok': [], 'errors': {}}
    if os.path.exists(PROGRESS_FILE):
        with open(PROGRESS_FILE) as f:
            progress = json.load(f)
    
    done_set = set(progress['done'])
    todo = [t for t in targets if t['numericId'] not in done_set]
    print(f'Already done: {len(done_set)}, remaining: {len(todo)}')
    
    for i, t in enumerate(todo):
        # Download the PDF
        try:
            req = urllib.request.Request(f'https://examanet.com/api/blob-teacher/{t["fileKey"]}', headers={'X-Internal-Token': 'devmanet-bulk-2026'})
            with urllib.request.urlopen(req, timeout=30) as resp:
                pdf_bytes = resp.read()
        except Exception as e:
            progress['done'].append(t['numericId'])
            progress['errors'][str(t['numericId'])] = f'download:{str(e)[:50]}'
            print(f'  [{i+1}/{len(todo)}] NID {t["numericId"]}: download_error')
            continue
        
        # Try tesseract
        text, err = extract_with_tesseract(pdf_bytes)
        progress['done'].append(t['numericId'])
        
        if not text or len(text) < 200:
            progress['errors'][str(t['numericId'])] = f'no_text:{err or "short"}'
            print(f'  [{i+1}/{len(todo)}] NID {t["numericId"]}: no_text ({len(text) if text else 0}c)')
        else:
            # Update ResourceContent (no need to re-upload PDF, just update text)
            try:
                update_content(t['id'], text)
                progress['ok'].append({'nid': t['numericId'], 'chars': len(text)})
                print(f'  [{i+1}/{len(todo)}] NID {t["numericId"]}: OK - {len(text)}c')
            except Exception as e:
                progress['errors'][str(t['numericId'])] = f'db:{str(e)[:50]}'
                print(f'  [{i+1}/{len(todo)}] NID {t["numericId"]}: db_error')
        
        if (i+1) % 5 == 0:
            with open(PROGRESS_FILE, 'w') as f:
                json.dump(progress, f, default=str)
    
    with open(PROGRESS_FILE, 'w') as f:
        json.dump(progress, f, default=str)
    
    print(f'\nFinal: {len(progress["ok"])} recovered, {len(progress["errors"])} failed')

if __name__ == '__main__':
    main()
