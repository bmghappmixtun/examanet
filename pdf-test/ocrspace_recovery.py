#!/usr/bin/env python3
"""Use OCR.space (free public API) for PDFs that Tesseract failed on."""
import os, json, re, urllib.request, urllib.parse, importlib.util
import fitz
import base64
from PIL import Image
import io

spec = importlib.util.spec_from_file_location('bulk_math_v5', '/workspace/edutunisie/pdf-test/bulk_math_v5.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)

PROGRESS_FILE = '/workspace/edutunisie/pdf-test/ocrspace_recovery_progress.json'
OCR_SPACE_URL = 'https://api.ocr.space/parse/image'

def ocr_space(image_bytes, lang='eng'):
    """Call OCR.space free API. Returns extracted text or None."""
    boundary = '----WebKitFormBoundary7MA4YWxkTrZu0gW'
    crlf = b'\r\n'
    parts = []
    # Fields
    fields = {
        'apikey': 'helloworld',
        'language': lang,
        'isOverlayRequired': 'false',
        'OCREngine': '2',
        'scale': 'true',
        'isTable': 'true',
    }
    for k, v in fields.items():
        parts.append(b'--' + boundary.encode())
        parts.append(f'Content-Disposition: form-data; name="{k}"'.encode())
        parts.append(b'')
        parts.append(v.encode())
    # File
    parts.append(b'--' + boundary.encode())
    parts.append(b'Content-Disposition: form-data; name="image"; filename="image.png"')
    parts.append(b'Content-Type: image/png')
    parts.append(b'')
    parts.append(image_bytes)
    parts.append(b'--' + boundary.encode() + b'--')
    parts.append(b'')
    
    data = crlf.join(parts)
    req = urllib.request.Request(OCR_SPACE_URL, data=data, headers={
        'Content-Type': f'multipart/form-data; boundary={boundary}',
    })
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            result = json.loads(r.read())
            if result.get('ParsedResults'):
                return result['ParsedResults'][0].get('ParsedText', '').strip()
            else:
                # Log error
                err = result.get('ErrorMessage', [{}])[0] if isinstance(result.get('ErrorMessage'), list) else result.get('ErrorMessage', '')
                if err:
                    print(f'    OCR.space: {str(err)[:100]}')
    except Exception as e:
        print(f'    OCR.space error: {str(e)[:80]}')
    return None

def process_pdf(pdf_bytes, lang='eng'):
    """Convert PDF pages to images and OCR each one."""
    try:
        doc = fitz.open(stream=pdf_bytes, filetype='pdf')
    except:
        return None
    
    full_text = ''
    for i in range(min(3, doc.page_count)):
        page = doc[i]
        pix = page.get_pixmap(dpi=200)
        img_bytes = pix.tobytes('png')
        text = ocr_space(img_bytes, lang=lang)
        if text:
            full_text += text + '\n\n'
    doc.close()
    return full_text.strip() if full_text else None

def update_content(rid, text, method):
    text_clean = re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]', '', text)
    wc = len(text_clean.split())
    sql = f'''
    INSERT INTO "ResourceContent" ("id", "resourceId", "fullText", "extractionMethod", "extractedAt", "wordCount")
    VALUES (gen_random_uuid()::text, $${rid}$$, $${text_clean}$$, $${method}$$, NOW(), {wc})
    ON CONFLICT ("resourceId") DO UPDATE SET
      "fullText" = EXCLUDED."fullText",
      "extractionMethod" = EXCLUDED."extractionMethod",
      "extractedAt" = NOW(),
      "wordCount" = EXCLUDED."wordCount"
    '''
    return m.neon_query(sql)

def main():
    # Get all 18 devoirat.net broken + the 4 already known to fail with tesseract
    r = m.neon_query('''
    SELECT r.id, r."numericId", r."fileKey", s.slug as subject
    FROM "Resource" r
    JOIN "Subject" s ON s.id = r."subjectId"
    WHERE r."importedFrom" = 'devoirat.net'
      AND r."numericId" IN (4220, 4797, 6273, 6938, 9264, 11313, 11510, 11533, 11534, 11650, 11661, 11674, 11687, 12338, 12475, 12826, 12990, 15070)
    ''')
    rows = r.get('response', [{}])[0].get('data', {}).get('rows', [])
    targets = [{'id': r[0], 'numericId': r[1], 'fileKey': r[2], 'subject': r[3]} for r in rows]
    print(f'Total targets: {len(targets)}')
    
    # Load existing tesseract progress
    tesseract_progress = json.load(open('/workspace/edutunisie/pdf-test/devoirat_recovery_progress.json'))
    tesseract_ok = set(r['nid'] for r in tesseract_progress.get('ok', []))
    tesseract_fail = set(int(k) for k, v in tesseract_progress.get('errors', {}).items() if v.startswith('no_text'))
    
    # Only process the ones tesseract failed
    todo = [t for t in targets if t['numericId'] in tesseract_fail or t['numericId'] not in tesseract_ok]
    print(f'Already OK from tesseract: {len(tesseract_ok)}')
    print(f'Will retry with OCR.space: {len(todo)}')
    
    progress = {'done': [], 'ok': [], 'errors': {}}
    if os.path.exists(PROGRESS_FILE):
        with open(PROGRESS_FILE) as f:
            progress = json.load(f)
    
    done_set = set(progress['done'])
    todo = [t for t in todo if t['numericId'] not in done_set]
    print(f'Already processed: {len(done_set)}, remaining: {len(todo)}')
    
    for i, t in enumerate(todo):
        # Download
        try:
            url = f'https://examanet.com/api/blob-teacher/{t["fileKey"]}'
            req = urllib.request.Request(url, headers={'X-Internal-Token': 'devmanet-bulk-2026'})
            with urllib.request.urlopen(req, timeout=30) as resp:
                pdf_bytes = resp.read()
        except Exception as e:
            progress['done'].append(t['numericId'])
            progress['errors'][str(t['numericId'])] = f'dl:{str(e)[:40]}'
            print(f'  [{i+1}/{len(todo)}] NID {t["numericId"]}: download error')
            continue
        
        # Choose language based on subject
        lang = 'ara' if t['subject'] in ('arabe', 'education-islamique') else 'eng'
        
        # OCR.space
        text = process_pdf(pdf_bytes, lang=lang)
        progress['done'].append(t['numericId'])
        
        if text and len(text) >= 200:
            try:
                update_content(t['id'], text, 'ocr-space')
                progress['ok'].append({'nid': t['numericId'], 'chars': len(text)})
                print(f'  [{i+1}/{len(todo)}] NID {t["numericId"]}: OK - {len(text)}c')
            except Exception as e:
                progress['errors'][str(t['numericId'])] = f'db:{str(e)[:40]}'
                print(f'  [{i+1}/{len(todo)}] NID {t["numericId"]}: db error')
        else:
            progress['errors'][str(t['numericId'])] = 'no_text'
            print(f'  [{i+1}/{len(todo)}] NID {t["numericId"]}: no_text ({len(text) if text else 0}c)')
        
        with open(PROGRESS_FILE, 'w') as f:
            json.dump(progress, f, default=str)
    
    print(f'\nFinal: {len(progress["ok"])} recovered, {len(progress["errors"])} failed')

if __name__ == '__main__':
    main()
