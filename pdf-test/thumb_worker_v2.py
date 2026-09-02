#!/usr/bin/env python3
"""Worker that downloads PDFs, renders first page with pymupdf,
and uploads JPEGs to the /api/admin/upload-thumbnail endpoint.

Pipeline:
1. Get resources without thumbnailKey
2. Download PDF via proxy
3. Render first page with pymupdf at ~1.5x scale
4. Resize to 300x400 max
5. Save as JPEG quality 80
6. POST base64 to upload-thumbnail endpoint
"""
import os, json, time, requests, fitz, base64
from PIL import Image
import io
import importlib.util
from concurrent.futures import ThreadPoolExecutor, as_completed

spec = importlib.util.spec_from_file_location('m', 'pdf-test/bulk_math_v5.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)

TOKEN = 'devmanet-bulk-2026'
PROXY = 'https://examanet.com/api/blob-teacher'
URL = 'https://examanet.com/api/admin/upload-thumbnail'
PROGRESS = '/workspace/edutunisie/pdf-test/thumb_worker_v2_progress.json'

def get_targets():
    r = m.neon_query('''
    SELECT id, "numericId", "fileKey"
    FROM "Resource"
    WHERE "thumbnailKey" IS NULL AND "fileKey" IS NOT NULL
    ORDER BY "numericId"
    ''')
    return [{'id': r[0], 'nid': r[1], 'fileKey': r[2]} for r in r.get('response', [{}])[0].get('data', {}).get('rows', [])]

def download(file_key):
    url = f'{PROXY}/{file_key}'
    r = requests.get(url, headers={'X-Internal-Token': TOKEN}, timeout=60)
    if r.status_code != 200: return None
    return r.content

def render_thumb(pdf_bytes):
    """Render first page to JPEG bytes via pymupdf."""
    try:
        doc = fitz.open(stream=pdf_bytes, filetype='pdf')
        if len(doc) == 0:
            doc.close()
            return None
        page = doc[0]
        # 1.5x scale = ~150 DPI
        mat = fitz.Matrix(1.5, 1.5)
        pix = page.get_pixmap(matrix=mat)
        img = Image.frombytes('RGB', [pix.width, pix.height], pix.samples)
        # Resize to max 300x400
        img.thumbnail((300, 400), Image.Resampling.LANCZOS)
        # White background
        if img.mode != 'RGB':
            img = img.convert('RGB')
        buf = io.BytesIO()
        img.save(buf, 'JPEG', quality=80)
        doc.close()
        return buf.getvalue()
    except Exception as e:
        return None

def upload_thumbnail(resource_id, file_key, jpeg_bytes):
    jpeg_b64 = base64.b64encode(jpeg_bytes).decode('ascii')
    r = requests.post(URL, 
        json={'resourceId': resource_id, 'jpegBase64': jpeg_b64, 'fileKey': file_key},
        headers={'X-Internal-Token': TOKEN, 'Content-Type': 'application/json'},
        timeout=30
    )
    if r.status_code == 200:
        return r.json()
    return None

def process(t):
    nid = str(t['nid'])
    if done.get(nid) == 'ok': return nid, 'skip'
    
    pdf = download(t['fileKey'])
    if not pdf: return nid, 'dl_fail'
    
    jpeg = render_thumb(pdf)
    if not jpeg: return nid, 'render_fail'
    
    result = upload_thumbnail(t['id'], t['fileKey'], jpeg)
    if not result or result.get('status') != 'ok':
        return nid, f'upload_fail:{result.get("status") if result else "null"}'
    
    return nid, 'ok'

# Load progress
done = {}
if os.path.exists(PROGRESS):
    with open(PROGRESS) as f: done = json.load(f)

targets = get_targets()
print(f'Total: {len(targets)}, remaining: {sum(1 for t in targets if str(t["nid"]) not in done or done[str(t["nid"])] != "ok")}', flush=True)

start = time.time()
ok = 0
fail = 0
processed = 0

with ThreadPoolExecutor(max_workers=6) as ex:
    futures = {ex.submit(process, t): t for t in targets if str(t['nid']) not in done or done[str(t['nid'])] != 'ok'}
    for fut in as_completed(futures):
        nid, status = fut.result()
        processed += 1
        if status == 'ok':
            ok += 1
            done[nid] = 'ok'
        else:
            fail += 1
            done[nid] = status
        if processed % 25 == 0:
            elapsed = time.time() - start
            rate = processed / elapsed if elapsed > 0 else 0
            remaining = (len(futures) - processed) / rate if rate > 0 else 0
            print(f'[{processed}/{len(futures)}] OK:{ok} FAIL:{fail} {rate:.1f}/s ETA {remaining/60:.0f}min', flush=True)
            with open(PROGRESS, 'w') as f: json.dump(done, f)

with open(PROGRESS, 'w') as f: json.dump(done, f)
print(f'\nFinal: {ok} OK, {fail} fail')
