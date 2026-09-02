#!/usr/bin/env python3
"""OCR + AI for the 21 remaining physique lycée files without keyInsights.

Reads files from /tmp/ocr_21_files.json, OCRs if needed, calls AI, writes results
to /tmp/ocr_21_results.json. Then a Node script applies them to the DB.
"""
import os
import json
import time
import requests
import tempfile
from pypdf import PdfReader
import pytesseract
from pdf2image import convert_from_path
from openai import OpenAI
from dotenv import load_dotenv
load_dotenv('/workspace/edutunisie/.env.local')

INTERNAL_TOKEN = os.environ.get("INTERNAL_BULK_TOKEN", "devmanet-bulk-2026")

with open('/tmp/ocr_21_files.json') as fp:
    files = json.load(fp)

print(f'Files to process: {len(files)}')

client = OpenAI(api_key=os.environ['OPENAI_API_KEY'])

def get_blob_text(file_key):
    """Download via internal API, extract text (OCR if needed)."""
    url = f'https://examanet.com/api/blob-teacher/{file_key}'
    headers = {'X-Internal-Token': INTERNAL_TOKEN}
    
    try:
        r = requests.get(url, headers=headers, timeout=30)
        if r.status_code != 200:
            return None, f'HTTP {r.status_code}'
        data = r.content
    except Exception as e:
        return None, f'download: {e}'
    
    if not data or len(data) < 100:
        return None, 'empty blob'
    
    with tempfile.NamedTemporaryFile(suffix='.pdf', delete=False) as tmp:
        tmp.write(data)
        tmp_path = tmp.name
    
    # Try PyPDF first
    try:
        reader = PdfReader(tmp_path)
        text = '\n'.join(page.extract_text() or '' for page in reader.pages)
        if len(text) > 1000:  # Need substantial text (just headers isn't enough)
            os.unlink(tmp_path)
            return text, 'pypdf'
    except Exception as e:
        pass
    
    # Fallback: OCR
    try:
        pages_imgs = convert_from_path(tmp_path, dpi=200)
        text = ''
        for img in pages_imgs:
            text += pytesseract.image_to_string(img, lang='fra+ara') + '\n'
        os.unlink(tmp_path)
        if len(text) > 200:
            return text, 'ocr'
        return None, 'OCR returned too little text'
    except Exception as e:
        os.unlink(tmp_path)
        return None, f'OCR failed: {e}'

def extract_exercises(num, title, text):
    if not text or len(text) < 100:
        return None
    
    nonce = f'{num}-{time.time()}'
    system = f"""Tu es un expert en physique-chimie du système éducatif tunisien.
Analyse ce document (titre: {title[:80]}) et extrais TOUS les exercices.
Pour CHAQUE exercice: "Exercice N (Physique|Chimie): [résumé FR, 15-25 mots]"
Texte peut être issu d'OCR (qualité variable). Extrais même si imparfait.
Si le document ne contient pas d'exercices, retourne un JSON vide.
Retourne UNIQUEMENT JSON: {{"exercises": ["Exercice 1 (...): ...", ...]}}
Nonce: {nonce}"""
    
    try:
        resp = client.chat.completions.create(
            model='gpt-4o-mini',
            messages=[
                {'role': 'system', 'content': system},
                {'role': 'user', 'content': f'---DOC---\n{text[:25000]}\n---END---'},
            ],
            response_format={'type': 'json_object'},
            temperature=0.1,
            max_tokens=3000,
        )
        parsed = json.loads(resp.choices[0].message.content)
        ex = parsed.get('exercises', [])
        valid = [e for e in ex if 'Exercice' in e and ':' in e and len(e) < 300]
        return valid if valid else None
    except Exception as e:
        print(f'  AI ERROR: {e}')
        return None

results = []
for i, f in enumerate(files):
    print(f'\n[{i+1}/{len(files)}] #{f["num"]}: {f["title"][:60]}')
    
    text, method = get_blob_text(f['filekey'])
    print(f'  Method: {method}, text_len: {len(text) if text else 0}')
    
    if not text or len(text) < 100:
        results.append({
            'id': f['id'], 'num': f['num'], 'success': False, 
            'reason': f'no text ({method})'
        })
        continue
    
    exercises = extract_exercises(f['num'], f['title'], text)
    if not exercises:
        results.append({
            'id': f['id'], 'num': f['num'], 'success': False,
            'reason': 'no exercises'
        })
        continue
    
    print(f'  ✓ Found {len(exercises)} exercises')
    results.append({
        'id': f['id'], 'num': f['num'], 'success': True,
        'count': len(exercises), 'method': method, 'exercises': exercises,
    })

print(f'\n=== SUMMARY ===')
ok = sum(1 for r in results if r['success'])
print(f'Success: {ok}/{len(results)}')

with open('/tmp/ocr_21_results.json', 'w') as fp:
    json.dump(results, fp, indent=2, ensure_ascii=False)
print('Results saved to /tmp/ocr_21_results.json')
