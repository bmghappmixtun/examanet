#!/usr/bin/env python3
"""
Bulk AI extraction for RISKY resources (no/broken text).
Strategy: pymupdf first (free, fast), GPT-4o-mini vision if text < 100 chars.

Run:  python3 bulk_risky_extraction.py
Stop: Ctrl-C (saves progress to bulk_risky_progress.json, resume by re-running)

Worker pattern: --worker-id N --total-workers M
"""
import os, json, time, argparse, sys
from pathlib import Path
import urllib.request, urllib.error
import fitz, re
from openai import OpenAI

NEON_API_KEY = os.environ['NEON_API_KEY']
NEON_PROJECT = 'little-silence-94324724'
BRANCH_ID = 'br-purple-recipe-as2x8yyo'
ROLE = 'edutunisie_app'
BLOB_BASE = 'https://kmy1h6us8l7bg7bg.public.blob.vercel-storage.com/'
PROXY_BASE = 'https://examanet.com/api/blob-teacher/'
INTERNAL_TOKEN = 'devmanet-bulk-2026'
USE_PROXY = True

client = OpenAI()

PROGRESS_FILE = '/workspace/edutunisie/pdf-test/bulk_risky_progress.json'


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
    """Download PDF via internal proxy."""
    if USE_PROXY:
        url = PROXY_BASE + file_key
    else:
        url = BLOB_BASE + file_key
    req = urllib.request.Request(url, headers={
        'X-Internal-Token': INTERNAL_TOKEN,
        'User-Agent': 'Examanet-Bulk-Extractor/1.0',
    })
    with urllib.request.urlopen(req, timeout=30) as resp:
        return resp.read()


def extract_pymupdf(pdf_bytes):
    """Try pymupdf extraction."""
    try:
        doc = fitz.open(stream=pdf_bytes, filetype='pdf')
        text = ''
        for page in doc:
            text += page.get_text() + '\n'
        text = sanitize_text(text)
        pages = doc.page_count
        doc.close()
        return text, pages
    except Exception as e:
        return '', 0


def extract_vision(pdf_bytes, file_key, max_pages=3):
    """Use GPT-4o-mini vision to extract text from image-based PDF."""
    try:
        doc = fitz.open(stream=pdf_bytes, filetype='pdf')
        all_text = []
        pages_to_process = min(doc.page_count, max_pages)
        for i in range(pages_to_process):
            page = doc[i]
            pix = page.get_pixmap(dpi=150)
            img_bytes = pix.tobytes('png')
            import base64
            b64 = base64.b64encode(img_bytes).decode()
            r = client.chat.completions.create(
                model='gpt-4o-mini',
                messages=[{
                    'role': 'user',
                    'content': [
                        {'type': 'text', 'text': 'Extract the text from this page of a Tunisian educational document. Preserve French and Arabic text exactly. Return only the extracted text, no commentary.'},
                        {'type': 'image_url', 'image_url': {'url': f'data:image/png;base64,{b64}', 'detail': 'low'}},
                    ]
                }],
                max_tokens=2000,
                temperature=0,
            )
            all_text.append(r.choices[0].message.content)
        doc.close()
        return '\n\n'.join(all_text), pages_to_process
    except Exception as e:
        return f'VISION_ERROR: {e}', 0


def save_resource_content(resource_id, full_text, page_count, method):
    """Save or update ResourceContent row."""
    full_text_safe = sql_escape(sanitize_text(full_text))
    page_count_safe = int(page_count) if page_count else 'NULL'
    method_safe = sql_escape(method)
    sql = f'''
    INSERT INTO "ResourceContent" ("id", "resourceId", "fullText", "pageCount", "extractionMethod", "extractedAt", "modelUsed")
    VALUES (gen_random_uuid()::text, '{resource_id}', {full_text_safe}, {page_count_safe}, {method_safe}, NOW(), {method_safe})
    ON CONFLICT ("resourceId") DO UPDATE SET
        "fullText" = EXCLUDED."fullText",
        "pageCount" = EXCLUDED."pageCount",
        "extractionMethod" = EXCLUDED."extractionMethod",
        "extractedAt" = NOW(),
        "modelUsed" = EXCLUDED."modelUsed"
    '''
    neon_query(sql)


def get_risky_resources(limit=10000, worker_id=0, total_workers=1):
    """Get all resources with no/broken text. Optionally filter by worker."""
    sql = f'''
    SELECT r.id, r."fileKey"
    FROM "Resource" r
    LEFT JOIN "ResourceContent" rc ON rc."resourceId" = r.id
    WHERE rc."resourceId" IS NULL 
       OR LENGTH(COALESCE(rc."fullText", '')) < 100
       OR rc."fullText" ILIKE '%unable to extract%'
       OR rc."fullText" ILIKE '%cannot extract%'
    ORDER BY r."numericId"
    LIMIT {limit}
    '''
    r = neon_query(sql)
    rows = r.get('response', [{}])[0].get('data', {}).get('rows', [])
    if total_workers > 1:
        # Hash-based partitioning
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
    parser.add_argument('--skip-vision', action='store_true', help='pymupdf only (no API cost)')
    args = parser.parse_args()

    print(f'[Worker {args.worker_id}/{args.total_workers}] Loading risky resources...')
    resources = get_risky_resources(args.limit, args.worker_id, args.total_workers)
    print(f'  Found {len(resources)} risky resources to process')

    done = load_progress()
    todo = [r for r in resources if r[0] not in done]
    print(f'  Already done: {len(done)} | To do: {len(todo)}')

    if not todo:
        print('Nothing to do!')
        return

    stats = {'pymupdf_ok': 0, 'vision_ok': 0, 'vision_err': 0, 'dl_err': 0, 'no_change': 0}
    start = time.time()

    for i, (resource_id, file_key) in enumerate(todo):
        if resource_id in done:
            continue
        try:
            pdf_bytes = download_pdf(file_key)
        except Exception as e:
            print(f'[{i+1}/{len(todo)}] DL err {resource_id}: {str(e)[:80]}')
            stats['dl_err'] += 1
            continue

        # Try pymupdf first
        text, pages = extract_pymupdf(pdf_bytes)
        method = 'pymupdf'

        if len(text.strip()) < 100 and not args.skip_vision:
            # Fallback to vision
            try:
                text, pages = extract_vision(pdf_bytes, file_key)
                method = 'gpt-4o-mini-vision'
                if text.startswith('VISION_ERROR'):
                    print(f'[{i+1}/{len(todo)}] Vision err {resource_id}: {text[:80]}')
                    stats['vision_err'] += 1
                    done.add(resource_id)
                    save_progress(done)
                    continue
                stats['vision_ok'] += 1
            except Exception as e:
                print(f'[{i+1}/{len(todo)}] Vision exc {resource_id}: {str(e)[:80]}')
                stats['vision_err'] += 1
                done.add(resource_id)
                save_progress(done)
                continue
        else:
            if len(text.strip()) < 100:
                stats['no_change'] += 1
                print(f'[{i+1}/{len(todo)}] Still empty {resource_id} (skipping)')
                done.add(resource_id)
                save_progress(done)
                continue
            stats['pymupdf_ok'] += 1

        # Save
        try:
            save_resource_content(resource_id, text, pages, method)
        except Exception as e:
            print(f'[{i+1}/{len(todo)}] DB err {resource_id}: {str(e)[:80]}')
            continue

        done.add(resource_id)
        if (i + 1) % 5 == 0:
            save_progress(done)  # Save progress every 5 iterations
        if (i + 1) % 25 == 0 or i < 5:
            elapsed = time.time() - start
            rate = (i + 1) / elapsed if elapsed > 0 else 0
            eta = (len(todo) - i - 1) / rate if rate > 0 else 0
            print(f'[{i+1}/{len(todo)}] {rate:.1f}/s | ETA {eta/60:.1f}min | '
                  f'pymupdf={stats["pymupdf_ok"]} vision={stats["vision_ok"]} '
                  f'err={stats["dl_err"]+stats["vision_err"]}')

    save_progress(done)
    elapsed = time.time() - start
    print()
    print('=' * 60)
    print(f'DONE in {elapsed/60:.1f}min')
    print(f'  pymupdf OK:    {stats["pymupdf_ok"]}')
    print(f'  vision OK:     {stats["vision_ok"]}')
    print(f'  vision err:    {stats["vision_err"]}')
    print(f'  DL err:        {stats["dl_err"]}')
    print(f'  no change:     {stats["no_change"]}')


if __name__ == '__main__':
    main()
