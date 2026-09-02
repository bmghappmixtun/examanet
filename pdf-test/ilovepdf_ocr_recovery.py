#!/usr/bin/env python3
"""
Complete OCR recovery for devoirat.net PDFs:
1. Download PDF from Vercel Blob
2. iLovePDF pdfocr → creates "searchable" PDF with invisible text
3. Render page as image
4. OCR.space → extract visible text
5. Save text to ResourceContent
"""
import os, json, re, subprocess, urllib.request, urllib.parse, importlib.util
import fitz
from PIL import Image
import io

spec = importlib.util.spec_from_file_location('bulk_math_v5', '/workspace/edutunisie/pdf-test/bulk_math_v5.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)

# iLovePDF keys
PUB_KEY = 'project_public_d1448365692fd5dee0aa5e617dc877a3_oZ7Rs0e163492d3ce295974b66731db65ce9c'
SEC_KEY = 'secret_key_5090a237520cd8bf28007277b0a8eaae_wePIX80644e3e7875908c7d17221d417f8cf5'

NIDS = [4220, 4797, 6273, 6938, 9264, 11313, 11510, 11533, 11534, 11650, 11661, 11674, 11687, 12338, 12475, 12826, 12990, 15070]
PROGRESS = '/workspace/edutunisie/pdf-test/ilove_ocr_recovery_progress.json'

# Update the Node.js helper
NODE_HELPER = '''const ILovePDFApi = require('@ilovepdf/ilovepdf-nodejs');
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
  const file = new ILovePDFFile(pdfPath);
  await task.addFile(file);
  await task.process({ ocr_languages: langs });
  const data = await task.download();
  fs.writeFileSync(outPath, data);
  console.log('OK:' + data.length);
}
main().catch(e => { console.error('ERR:' + e.message); process.exit(1); });
'''
with open('ilove_ocr.js', 'w') as f:
    f.write(NODE_HELPER)

def download_pdf(fk):
    url = f'https://examanet.com/api/blob-teacher/{fk}'
    req = urllib.request.Request(url, headers={'X-Internal-Token': 'devmanet-bulk-2026'})
    with urllib.request.urlopen(req, timeout=60) as resp:
        return resp.read()

def ocr_pdf_ilovepdf(pdf_bytes, out_path, langs):
    with open('/tmp/_ocr_in.pdf', 'wb') as f:
        f.write(pdf_bytes)
    result = subprocess.run(
        ['node', 'ilove_ocr.js', PUB_KEY, SEC_KEY, '/tmp/_ocr_in.pdf', out_path, ','.join(langs)],
        capture_output=True, text=True, timeout=180
    )
    if 'OK:' in result.stdout:
        return True
    print(f'    iLovePDF err: {result.stderr[:200]}')
    return False

def ocr_space_image(image_bytes, lang='fre'):
    OCR_URL = 'https://api.ocr.space/parse/image'
    boundary = '----WebKitFormBoundary7MA4YWxkTrZu0gW'
    parts = [
        b'--' + boundary.encode(),
        b'Content-Disposition: form-data; name="apikey"', b'', b'helloworld',
        b'--' + boundary.encode(),
        b'Content-Disposition: form-data; name="language"', b'', lang.encode(),
        b'--' + boundary.encode(),
        b'Content-Disposition: form-data; name="isOverlayRequired"', b'', b'false',
        b'--' + boundary.encode(),
        b'Content-Disposition: form-data; name="OCREngine"', b'', b'2',
        b'--' + boundary.encode(),
        b'Content-Disposition: form-data; name="image"; filename="page.png"',
        b'Content-Type: image/png', b'', image_bytes,
        b'--' + boundary.encode() + b'--', b'',
    ]
    data = b'\r\n'.join(parts)
    req = urllib.request.Request(OCR_URL, data=data, headers={
        'Content-Type': f'multipart/form-data; boundary={boundary}'
    })
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            result = json.loads(r.read())
            if result.get('ParsedResults'):
                return result['ParsedResults'][0].get('ParsedText', '').strip()
    except Exception as e:
        print(f'    OCR.space err: {str(e)[:100]}')
    return None

def extract_text_from_searchable_pdf(pdf_path):
    """Render pages of iLovePDF-OCR'd PDF and extract text via OCR.space."""
    doc = fitz.open(pdf_path)
    full_text = ''
    for i in range(min(3, doc.page_count)):
        pix = doc[i].get_pixmap(dpi=200)
        img_bytes = pix.tobytes('png')
        text = ocr_space_image(img_bytes, lang='fre')
        if text:
            full_text += text + '\n\n'
    doc.close()
    return full_text.strip() if full_text else None

def update_content(rid, text):
    text_clean = re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]', '', text)
    wc = len(text_clean.split())
    sql = f'''
    INSERT INTO "ResourceContent" ("id", "resourceId", "fullText", "extractionMethod", "extractedAt", "wordCount")
    VALUES (gen_random_uuid()::text, $${rid}$$, $${text_clean}$$, 'ilovepdf-ocr+ocrspace', NOW(), {wc})
    ON CONFLICT ("resourceId") DO UPDATE SET
      "fullText" = EXCLUDED."fullText",
      "extractionMethod" = EXCLUDED."extractionMethod",
      "extractedAt" = NOW(),
      "wordCount" = EXCLUDED."wordCount"
    '''
    return m.neon_query(sql)

def get_targets():
    r = m.neon_query(f'''
    SELECT r.id, r."numericId", r."fileKey", s.slug as subject
    FROM "Resource" r
    JOIN "Subject" s ON s.id = r."subjectId"
    WHERE r."importedFrom" = 'devoirat.net'
      AND r."numericId" IN ({','.join(str(n) for n in NIDS)})
    ''')
    rows = r.get('response', [{}])[0].get('data', {}).get('rows', [])
    return [{'id': r[0], 'numericId': r[1], 'fileKey': r[2], 'subject': r[3]} for r in rows]

def main():
    targets = get_targets()
    print(f'Total targets: {len(targets)}')
    
    progress = {'done': [], 'ok': [], 'errors': {}}
    if os.path.exists(PROGRESS):
        with open(PROGRESS) as f:
            progress = json.load(f)
    
    done_set = set(progress['done'])
    todo = [t for t in targets if t['numericId'] not in done_set]
    print(f'Already done: {len(done_set)}, remaining: {len(todo)}')
    
    for i, t in enumerate(todo):
        # 1. Download
        try:
            pdf_bytes = download_pdf(t['fileKey'])
        except Exception as e:
            progress['done'].append(t['numericId'])
            progress['errors'][str(t['numericId'])] = f'dl:{str(e)[:40]}'
            print(f'  [{i+1}/{len(todo)}] NID {t["numericId"]}: dl err')
            continue
        
        # 2. iLovePDF OCR
        ocr_pdf = f'/tmp/_ocr_{t["numericId"]}.pdf'
        langs = ['fra', 'ara'] if t['subject'] in ('arabe', 'education-islamique') else ['fra', 'eng']
        if not ocr_pdf_ilovepdf(pdf_bytes, ocr_pdf, langs):
            progress['done'].append(t['numericId'])
            progress['errors'][str(t['numericId'])] = 'ilovepdf_failed'
            print(f'  [{i+1}/{len(todo)}] NID {t["numericId"]}: ilovepdf failed')
            continue
        
        # 3. OCR.space on rendered pages
        text = extract_text_from_searchable_pdf(ocr_pdf)
        progress['done'].append(t['numericId'])
        
        if not text or len(text) < 200:
            progress['errors'][str(t['numericId'])] = 'ocrspace_short'
            print(f'  [{i+1}/{len(todo)}] NID {t["numericId"]}: ocrspace short ({len(text) if text else 0}c)')
        else:
            try:
                update_content(t['id'], text)
                progress['ok'].append({'nid': t['numericId'], 'chars': len(text)})
                print(f'  [{i+1}/{len(todo)}] NID {t["numericId"]}: OK - {len(text)}c')
            except Exception as e:
                progress['errors'][str(t['numericId'])] = f'db:{str(e)[:40]}'
                print(f'  [{i+1}/{len(todo)}] NID {t["numericId"]}: db err')
        
        # Cleanup
        for p in [ocr_pdf, '/tmp/_ocr_in.pdf']:
            if os.path.exists(p): os.remove(p)
        
        with open(PROGRESS, 'w') as f:
            json.dump(progress, f, default=str)
    
    print(f'\nFinal: {len(progress["ok"])} recovered, {len(progress["errors"])} failed')

if __name__ == '__main__':
    main()
