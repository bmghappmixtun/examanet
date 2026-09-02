#!/usr/bin/env python3
"""
Tesseract OCR for GPT-refused resources.
Local OCR with Arabic + French language packs.

Strategy: tesseract via pytesseract with lang='ara+fra+eng'
Replaces GPT-refused ResourceContent rows with tesseract output.

Run:  python3 bulk_tesseract_ocr.py
Stop: Ctrl-C (saves progress to bulk_tesseract_progress.json)
"""
import os, json, time, argparse, sys
from pathlib import Path
import urllib.request
import fitz, re
import pytesseract
from PIL import Image
import io

NEON_API_KEY = os.environ['NEON_API_KEY']
NEON_PROJECT = 'little-silence-94324724'
BRANCH_ID = 'br-purple-recipe-as2x8yyo'
ROLE = 'edutunisie_app'
PROXY_BASE = 'https://examanet.com/api/blob-teacher/'
INTERNAL_TOKEN = 'devmanet-bulk-2026'
PROGRESS_FILE = '/workspace/edutunisie/pdf-test/bulk_tesseract_progress.json'

# Tesseract config - PSM 6 = Assume a single uniform block of text
TESSERACT_CONFIG = '--oem 1 --psm 6'


def neon_query(sql):
    body = {
        'db_name': 'neondb',
        'role_name': ROLE,
        'query': sql,
        'branch_id': BRANCH_ID,
    }
    req = urllib.request.Request(
        f'https://console.neon.tech/api/v2/projects/{NEON_PROJECT}/query',
        data=json.dumps(body).encode(),
        headers={'Authorization': f'Bearer {NEON_API_KEY}', 'Content-Type': 'application/json'}
    )
    with urllib.request.urlopen(req, timeout=60) as resp:
        result = json.loads(resp.read())
    if result.get('response'):
        for item in result['response']:
            if item.get('error'):
                raise Exception(f"SQL error: {item['error'][:300]}")
    return result


def sql_escape(val):
    if val is None:
        return 'NULL'
    if isinstance(val, (int, float)):
        return str(val)
    s = str(val).replace("\\", "\\\\").replace("'", "''")
    if len(s) > 50000:
        s = s[:50000]
    return f"'{s}'"


def sanitize_text(s):
    if not s:
        return s
    return re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]', '', s)


def download_pdf(file_key):
    url = PROXY_BASE + file_key
    req = urllib.request.Request(url, headers={'X-Internal-Token': INTERNAL_TOKEN})
    with urllib.request.urlopen(req, timeout=30) as resp:
        return resp.read()


def ocr_pdf(pdf_bytes, max_pages=3, dpi=200, lang='ara+fra+eng'):
    """Run tesseract on first N pages of a PDF."""
    try:
        doc = fitz.open(stream=pdf_bytes, filetype='pdf')
        all_text = []
        pages_to_process = min(doc.page_count, max_pages)
        for i in range(pages_to_process):
            page = doc[i]
            pix = page.get_pixmap(dpi=dpi)
            img_bytes = pix.tobytes('png')
            img = Image.open(io.BytesIO(img_bytes))
            try:
                page_text = pytesseract.image_to_string(img, lang=lang, config=TESSERACT_CONFIG)
            except Exception:
                # Fallback to eng only
                page_text = pytesseract.image_to_string(img, lang='eng', config=TESSERACT_CONFIG)
            all_text.append(page_text)
        doc.close()
        return '\n\n--- PAGE BREAK ---\n\n'.join(all_text), pages_to_process
    except Exception as e:
        return f'TESSERACT_ERROR: {e}', 0


def save_resource_content(resource_id, full_text, page_count):
    full_text_safe = sql_escape(sanitize_text(full_text))
    page_count_safe = int(page_count) if page_count else 'NULL'
    sql = f'''
    UPDATE "ResourceContent"
    SET "fullText" = {full_text_safe},
        "pageCount" = {page_count_safe},
        "extractionMethod" = 'tesseract',
        "extractedAt" = NOW(),
        "modelUsed" = 'tesseract-5.3.0-ara+fra+eng'
    WHERE "resourceId" = '{resource_id}'
    '''
    neon_query(sql)


def get_refused_resources(limit=10000, worker_id=0, total_workers=1):
    """Get all resources where GPT refused (sorry/unable/cannot)."""
    sql = f'''
    SELECT r.id, r."fileKey"
    FROM "Resource" r
    JOIN "ResourceContent" rc ON rc."resourceId" = r.id
    WHERE rc."fullText" ILIKE '%sorry%' 
       OR rc."fullText" ILIKE '%unable to extract%'
       OR rc."fullText" ILIKE '%cannot extract%'
       OR (LENGTH(rc."fullText") < 50 AND rc."extractionMethod" = 'gpt-4o-mini-vision')
    ORDER BY r."numericId"
    LIMIT {limit}
    '''
    r = neon_query(sql)
    rows = r.get('response', [{}])[0].get('data', {}).get('rows', [])
    if total_workers > 1:
        rows = [row for i, row in enumerate(rows) if hash(row[0]) % total_workers == worker_id]
    return rows


def load_progress():
    if os.path.exists(PROGRESS_FILE):
        with open(PROGRESS_FILE) as f:
            return set(json.load(f))
    return set()


def save_progress(done):
    with open(PROGRESS_FILE, 'w') as f:
        json.dump(list(done), f)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--worker-id', type=int, default=0)
    parser.add_argument('--total-workers', type=int, default=1)
    parser.add_argument('--limit', type=int, default=10000)
    parser.add_argument('--dpi', type=int, default=200)
    parser.add_argument('--max-pages', type=int, default=3)
    parser.add_argument('--lang', default='ara+fra+eng')
    args = parser.parse_args()

    print(f'[Worker {args.worker_id}/{args.total_workers}] Loading GPT-refused resources...')
    resources = get_refused_resources(args.limit, args.worker_id, args.total_workers)
    print(f'  Found {len(resources)} to process (dpi={args.dpi}, lang={args.lang})')

    done = load_progress()
    todo = [r for r in resources if r[0] not in done]
    print(f'  Already done: {len(done)} | To do: {len(todo)}')

    if not todo:
        print('Nothing to do!')
        return

    stats = {'ok': 0, 'short': 0, 'err': 0, 'dl_err': 0}
    start = time.time()

    for i, (resource_id, file_key) in enumerate(todo):
        if resource_id in done:
            continue
        try:
            pdf_bytes = download_pdf(file_key)
        except Exception as e:
            stats['dl_err'] += 1
            done.add(resource_id)
            save_progress(done)
            continue

        text, pages = ocr_pdf(pdf_bytes, max_pages=args.max_pages, dpi=args.dpi, lang=args.lang)
        text = sanitize_text(text)

        if text.startswith('TESSERACT_ERROR') or len(text.strip()) < 30:
            stats['err' if text.startswith('TESSERACT_ERROR') else 'short'] += 1
            print(f'[{i+1}/{len(todo)}] {text[:80] if text.startswith("TESSERACT") else "short"} {resource_id[:12]}...')
            done.add(resource_id)
            save_progress(done)
            continue

        try:
            save_resource_content(resource_id, text, pages)
            stats['ok'] += 1
        except Exception as e:
            stats['err'] += 1
            print(f'[{i+1}/{len(todo)}] DB err {resource_id[:12]}: {str(e)[:80]}')

        done.add(resource_id)
        if (i + 1) % 5 == 0:
            save_progress(done)
        if (i + 1) % 10 == 0 or i < 3:
            elapsed = time.time() - start
            rate = (i + 1) / elapsed if elapsed > 0 else 0
            eta = (len(todo) - i - 1) / rate if rate > 0 else 0
            print(f'[{i+1}/{len(todo)}] {rate:.2f}/s | ETA {eta/60:.1f}min | '
                  f'ok={stats["ok"]} err={stats["err"]+stats["dl_err"]} short={stats["short"]}')

    save_progress(done)
    elapsed = time.time() - start
    print()
    print('=' * 60)
    print(f'DONE in {elapsed/60:.1f}min')
    print(f'  OCR OK:        {stats["ok"]}')
    print(f'  OCR short:     {stats["short"]}')
    print(f'  OCR error:     {stats["err"]}')
    print(f'  DL error:      {stats["dl_err"]}')


if __name__ == '__main__':
    main()
