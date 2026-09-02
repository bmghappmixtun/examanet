#!/usr/bin/env python3
"""P5: Fix bad whitespace in titles (540).
- Multiple spaces → single space
- Trailing/leading whitespace → trimmed
"""
import os, json, re, importlib.util

spec = importlib.util.spec_from_file_location('m', 'pdf-test/bulk_math_v5.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)

PROGRESS = '/workspace/edutunisie/pdf-test/fix_p5_progress.json'

# Load progress
done = {}
if os.path.exists(PROGRESS):
    with open(PROGRESS) as f: done = json.load(f)

# Get titles with bad whitespace
print('Loading...', flush=True)
r = m.neon_query("""
SELECT id, "numericId", title
FROM "Resource"
WHERE title ~ '  |^\\s|\\s$'
""")
targets = [{'id': r[0], 'nid': r[1], 'title': str(r[2])} for r in r.get('response', [{}])[0].get('data', {}).get('rows', [])]
print(f'Total: {len(targets)}', flush=True)

# Examples
print('\nExamples:')
for t in targets[:10]:
    old = t['title']
    new = re.sub(r' +', ' ', old).strip()
    print(f'  NID {t["nid"]}: "{repr(old[:60])}" → "{repr(new[:60])}"')

# Apply
ok = 0
fail = 0
for i, t in enumerate(targets):
    nid_s = str(t['nid'])
    if done.get(nid_s) == 'ok':
        continue
    old = t['title']
    new = re.sub(r' +', ' ', old).strip()
    if new == old:
        done[nid_s] = 'no_change'
        continue
    new_clean = re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]', '', new).replace("'", "''")
    sql = f"UPDATE \"Resource\" SET title = $${new_clean}$$ WHERE id = '{t['id']}'"
    try:
        m.neon_query(sql)
        done[nid_s] = 'ok'
        ok += 1
    except Exception as e:
        done[nid_s] = f'fail:{str(e)[:50]}'
        fail += 1
    if (i+1) % 50 == 0:
        print(f'[{i+1}/{len(targets)}] OK:{ok} FAIL:{fail}', flush=True)
        with open(PROGRESS, 'w') as f: json.dump(done, f)

with open(PROGRESS, 'w') as f: json.dump(done, f)
print(f'\nDone: {ok} OK, {fail} fail')
