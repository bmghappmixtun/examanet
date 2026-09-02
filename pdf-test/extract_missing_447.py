#!/usr/bin/env python3
"""
Extract the 447 NO CONTENT resources that have HTTP 200 but no ResourceContent row.
Strategy: pymupdf first, GPT-4o-mini vision fallback if text < 100 chars.
"""
import os, json, time, argparse, sys
from pathlib import Path
import urllib.request, urllib.error
import fitz, re
from openai import OpenAI
import concurrent.futures

NEON_API_KEY = os.environ['NEON_API_KEY']
NEON_PROJECT = 'little-silence-94324724'
BRANCH_ID = 'br-purple-recipe-as2x8yyo'
ROLE = 'edutunisie_app'
PROXY_BASE = 'https://examanet.com/api/blob-teacher/'
INTERNAL_TOKEN = 'devmanet-bulk-2026'
client = OpenAI()
PROGRESS_FILE = '/workspace/edutunisie/pdf-test/extract_missing_447_progress.json'

def neon_query(sql):
    body = {'db_name': 'neondb', 'role_name': ROLE, 'query': sql, 'branch_id': BRANCH_ID}
    req = urllib.request.Request(
        f'https://console.neon.tech/api/v2/projects/{NEON_PROJECT}/query',
        data=json.dumps(body).encode(),
        headers={'Authorization': f'Bearer {NEON_API_KEY}', 'Content-Type': 'application/json'}
    )
    with urllib.request.urlopen(req, timeout=60) as resp:
        return json.loads(resp.read())

def sql_escape(val):
    if val is None: return 'NULL'
    if isinstance(val, (int, float)): return str(val)
    s = str(val).replace("\\", "\\\\").replace("'", "''")
    if len(s) > 50000: s = s[:50000]
    return f"'{s}'"

def sanitize(s):
    if not s: return s
    return re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]', '', s)

def download_pdf(file_key):
    url = PROXY_BASE + file_key
    req = urllib.request.Request(url, headers={'X-Internal-Token': INTERNAL_TOKEN, 'User-Agent': 'Examanet-MissingExtractor/1.0'})
    with urllib.request.urlopen(req, timeout=30) as resp:
        return resp.read()

def extract_pymupdf(pdf_bytes):
    text = ''
    try:
        doc = fitz.open(stream=pdf_bytes, filetype='pdf')
        for page in doc:
            text += page.get_text() + '\n'
        doc.close()
    except Exception as e:
        return None, f'pymupdf_error:{e}'
    return text.strip(), None

def extract_gpt_vision(pdf_bytes, file_key):
    try:
        doc = fitz.open(stream=pdf_bytes, filetype='pdf')
        images = []
        for i in range(min(3, doc.page_count)):
            page = doc[i]
            pix = page.get_pixmap(dpi=150)
            images.append((pix.tobytes('png'), f'p{i+1}'))
        doc.close()
    except Exception as e:
        return None, f'render_error:{e}'
    
    if not images:
        return None, 'no_pages'
    
    content = [{'type': 'text', 'text': 'Extract ALL text from this Tunisian school PDF (FR/AR/EN). Return text only.'}]
    for img_bytes, name in images:
        b64 = __import__('base64').b64encode(img_bytes).decode()
        content.append({'type': 'image_url', 'image_url': {'url': f'data:image/png;base64,{b64}', 'detail': 'low'}})
    
    try:
        resp = client.chat.completions.create(
            model='gpt-4o-mini',
            messages=[{'role': 'user', 'content': content}],
            max_tokens=2000,
            timeout=60
        )
        return resp.choices[0].message.content.strip(), None
    except Exception as e:
        return None, f'gpt_error:{e}'

def upsert_content(resource_id, text, method):
    wc = len(text.split()) if text else 0
    sql = f'''
    INSERT INTO "ResourceContent" ("id", "resourceId", "fullText", "extractionMethod", "extractedAt", "wordCount")
    VALUES (gen_random_uuid()::text, {sql_escape(resource_id)}, {sql_escape(text)}, {sql_escape(method)}, NOW(), {wc})
    ON CONFLICT ("resourceId") DO UPDATE SET
      "fullText" = EXCLUDED."fullText",
      "extractionMethod" = EXCLUDED."extractionMethod",
      "extractedAt" = NOW(),
      "wordCount" = EXCLUDED."wordCount"
    '''
    return neon_query(sql)

def get_targets():
    r = neon_query('''
    SELECT r.id, r."numericId", r."fileKey", r.title
    FROM "Resource" r
    WHERE r.id NOT IN (SELECT "resourceId" FROM "ResourceContent" WHERE "resourceId" IS NOT NULL)
      AND r."fileKey" NOT LIKE '%-stamped%'
    ORDER BY r."numericId"
    ''')
    return r.get('response', [{}])[0].get('data', {}).get('rows', [])

def process_one(row, stats):
    rid, nid, fk, title = row
    try:
        pdf_bytes = download_pdf(fk)
    except urllib.error.HTTPError as e:
        return nid, 'http_' + str(e.code), 0, f'http {e.code}'
    except Exception as e:
        return nid, 'download_error', 0, str(e)[:80]
    
    # Try pymupdf first
    text, err = extract_pymupdf(pdf_bytes)
    method = 'pymupdf'
    if err or not text or len(text) < 100:
        # Try GPT vision
        text, err = extract_gpt_vision(pdf_bytes, fk)
        method = 'gpt-4o-mini-vision'
        if err or not text:
            return nid, 'both_failed', 0, err or 'empty'
    
    if 'unable to extract' in text.lower() or 'sorry, but i can' in text.lower():
        return nid, 'gpt_refused', len(text), 'gpt refused'
    
    text = sanitize(text)
    try:
        upsert_content(rid, text, method)
        return nid, 'ok', len(text), method
    except Exception as e:
        return nid, 'db_error', len(text), str(e)[:80]

def main():
    targets = get_targets()
    print(f'Total targets: {len(targets)}')
    
    # Load progress
    progress = {'done': [], 'errors': {}}
    if os.path.exists(PROGRESS_FILE):
        with open(PROGRESS_FILE) as f:
            progress = json.load(f)
    
    done_set = set(progress['done'])
    todo = [t for t in targets if t[1] not in done_set]
    print(f'Already done: {len(done_set)}, remaining: {len(todo)}')
    
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as ex:
        futures = {ex.submit(process_one, t, None): t for t in todo}
        for i, fut in enumerate(concurrent.futures.as_completed(futures)):
            nid, status, tlen, info = fut.result()
            progress['done'].append(nid)
            if status != 'ok':
                progress['errors'][nid] = f'{status}:{info}'
            if (i+1) % 20 == 0:
                with open(PROGRESS_FILE, 'w') as f:
                    json.dump(progress, f)
                print(f'  [{i+1}/{len(todo)}] NID {nid}: {status} ({tlen}c) {info[:50]}')
            else:
                print(f'  NID {nid}: {status} ({tlen}c) {info[:50]}')
    
    with open(PROGRESS_FILE, 'w') as f:
        json.dump(progress, f)
    
    print()
    print(f'Final: {len(progress["done"])} processed, {len(progress["errors"])} errors')

if __name__ == '__main__':
    main()
