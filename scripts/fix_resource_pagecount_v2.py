import os, io, sys, json, time, urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from pypdf import PdfReader

# Load file list (from Resource.pageCount now)
with open('/tmp/files_resource.json') as f:
    files = json.load(f)
print(f'Loaded {len(files)} files', file=sys.stderr)

TOKEN = os.environ.get('INTERNAL_BULK_TOKEN') or 'devmanet-bulk-2026'

def fetch_and_count(file):
    fk = file['key']
    url = f'https://examanet.com/api/blob-teacher/{fk}'
    try:
        req = urllib.request.Request(url, headers={'x-internal-token': TOKEN})
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = resp.read()
        if len(data) < 100:
            return {'id': file['id'], 'num': file['num'], 'old': file['old'], 'new': None, 'err': 'too small'}
        if not data.startswith(b'%PDF'):
            return {'id': file['id'], 'num': file['num'], 'old': file['old'], 'new': None, 'err': 'not a PDF'}
        reader = PdfReader(io.BytesIO(data))
        return {'id': file['id'], 'num': file['num'], 'old': file['old'], 'new': len(reader.pages), 'err': None}
    except Exception as e:
        return {'id': file['id'], 'num': file['num'], 'old': file['old'], 'new': None, 'err': str(e)[:80]}

results = []
start = time.time()
with ThreadPoolExecutor(max_workers=30) as pool:
    futures = {pool.submit(fetch_and_count, f): f for f in files}
    for i, future in enumerate(as_completed(futures)):
        r = future.result()
        results.append(r)
        if (i+1) % 500 == 0:
            elapsed = time.time() - start
            print(f'  {i+1}/{len(files)} ({elapsed:.0f}s)', file=sys.stderr)

elapsed = time.time() - start
print(f'Done in {elapsed:.0f}s ({len(results)/elapsed:.1f} files/s)', file=sys.stderr)

with open('/tmp/pagecount_resource_v2_results.json', 'w') as f:
    json.dump(results, f)

errs = [r for r in results if r['err']]
diffs = [r for r in results if r['new'] is not None and r['old'] != r['new']]
nulls = [r for r in results if r['old'] is None and r['new'] is not None]
same = [r for r in results if r['new'] is not None and r['old'] == r['new']]
print(f'Errors: {len(errs)}', file=sys.stderr)
print(f'Different from old: {len(diffs)}', file=sys.stderr)
print(f'Was NULL: {len(nulls)}', file=sys.stderr)
print(f'Same as old: {len(same)}', file=sys.stderr)
