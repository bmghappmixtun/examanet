#!/usr/bin/env python3
"""Recover 18 devoirat.net PDFs via tesseract + GPT-4o."""
import os, json, re, urllib.request, importlib.util
import fitz
import pytesseract
from PIL import Image
import io
import concurrent.futures
from openai import OpenAI

spec = importlib.util.spec_from_file_location('bulk_math_v5', '/workspace/edutunisie/pdf-test/bulk_math_v5.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
client = OpenAI()

PROGRESS_FILE = '/workspace/edutunisie/pdf-test/devoirat_recovery_progress.json'
NIDS = [4220, 4797, 6273, 6938, 9264, 11313, 11510, 11533, 11534, 11650, 11661, 11674, 11687, 12338, 12475, 12826, 12990, 15070]

def download_pdf(file_key):
    url = f'https://examanet.com/api/blob-teacher/{file_key}'
    req = urllib.request.Request(url, headers={'X-Internal-Token': 'devmanet-bulk-2026'})
    with urllib.request.urlopen(req, timeout=30) as resp:
        return resp.read()

def tesseract_extract(pdf_bytes):
    try:
        doc = fitz.open(stream=pdf_bytes, filetype='pdf')
        total_text = ''
        for page in doc:
            pix = page.get_pixmap(dpi=250)
            img = Image.open(io.BytesIO(pix.tobytes('png')))
            for psm in [3, 6, 4, 11]:
                try:
                    text = pytesseract.image_to_string(img, lang='ara+fra', config=f'--oem 1 --psm {psm}')
                    if text and len(text) > len(total_text):
                        total_text = text
                except:
                    continue
        doc.close()
        return total_text.strip()
    except Exception as e:
        return None

def gpt4o_extract(pdf_bytes):
    try:
        doc = fitz.open(stream=pdf_bytes, filetype='pdf')
        images = []
        for i in range(min(3, doc.page_count)):
            page = doc[i]
            pix = page.get_pixmap(dpi=150)
            images.append((pix.tobytes('png'), f'p{i+1}'))
        doc.close()
    except:
        return None
    if not images:
        return None
    
    content = [{'type': 'text', 'text': 'Extract ALL text from this Tunisian school PDF (FR/AR/EN/math). Return only the text content.'}]
    for img_bytes, name in images:
        b64 = __import__('base64').b64encode(img_bytes).decode()
        content.append({'type': 'image_url', 'image_url': {'url': f'data:image/png;base64,{b64}', 'detail': 'high'}})
    
    try:
        resp = client.chat.completions.create(
            model='gpt-4o',  # Full model, less strict than mini
            messages=[{'role': 'user', 'content': content}],
            max_tokens=3000,
            timeout=60,
        )
        return resp.choices[0].message.content.strip()
    except Exception as e:
        return None

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

def process_target(t, use_gpt4o=False):
    """Process one target: download, extract, update."""
    rid, nid, fk = t['id'], t['numericId'], t['fileKey']
    method_pref = t.get('method', '')
    
    # Download
    try:
        pdf_bytes = download_pdf(fk)
    except Exception as e:
        return {'nid': nid, 'status': 'download_error', 'error': str(e)[:50]}
    
    # Extract - try tesseract first (or gpt-4o if requested)
    text = None
    method = None
    if use_gpt4o:
        text = gpt4o_extract(pdf_bytes)
        method = 'gpt-4o'
    
    if not text or len(text) < 200:
        text = tesseract_extract(pdf_bytes)
        method = 'tesseract-arab-fra'
    
    if not text or len(text) < 200:
        return {'nid': nid, 'status': 'no_text', 'chars': len(text) if text else 0}
    
    # Update
    try:
        update_content(rid, text, method)
        return {'nid': nid, 'status': 'ok', 'chars': len(text), 'method': method}
    except Exception as e:
        return {'nid': nid, 'status': 'db_error', 'error': str(e)[:50]}

def get_targets():
    r = m.neon_query(f'''
    SELECT r.id, r."numericId", r."fileKey", rc."extractionMethod" as method
    FROM "Resource" r
    LEFT JOIN "ResourceContent" rc ON rc."resourceId" = r.id
    WHERE r."importedFrom" = 'devoirat.net'
      AND r."numericId" IN ({','.join(str(n) for n in NIDS)})
    ''')
    rows = r.get('response', [{}])[0].get('data', {}).get('rows', [])
    return [{'id': r[0], 'numericId': r[1], 'fileKey': r[2], 'method': r[3] or ''} for r in rows]

def main():
    targets = get_targets()
    print(f'Total targets: {len(targets)}')
    
    # Group: GPT refused use GPT-4o, others use tesseract
    gpt_nids = [4220, 4797, 9264]  # The 3 gpt_refused
    
    progress = {'done': [], 'ok': [], 'errors': {}}
    if os.path.exists(PROGRESS_FILE):
        with open(PROGRESS_FILE) as f:
            progress = json.load(f)
    
    done_set = set(progress['done'])
    todo = [t for t in targets if t['numericId'] not in done_set]
    print(f'Already done: {len(done_set)}, remaining: {len(todo)}')
    
    for i, t in enumerate(todo):
        use_gpt4o = t['numericId'] in gpt_nids
        result = process_target(t, use_gpt4o=use_gpt4o)
        progress['done'].append(t['numericId'])
        if result.get('status') == 'ok':
            progress['ok'].append(result)
            print(f'  [{i+1}/{len(todo)}] NID {result["nid"]}: OK - {result["chars"]}c ({result["method"]})')
        else:
            progress['errors'][str(t['numericId'])] = f"{result.get('status')}:{result.get('error', '')}"
            print(f'  [{i+1}/{len(todo)}] NID {t["numericId"]}: {result.get("status")} {result.get("error", "")[:30]}')
        
        if (i+1) % 3 == 0:
            with open(PROGRESS_FILE, 'w') as f:
                json.dump(progress, f, default=str)
    
    with open(PROGRESS_FILE, 'w') as f:
        json.dump(progress, f, default=str)
    
    print(f'\nFinal: {len(progress["ok"])} recovered, {len(progress["errors"])} failed')

if __name__ == '__main__':
    main()
