#!/usr/bin/env python3
"""P7: Fix titles with non-breaking space or missing spaces around -.
"""
import os, json, re, importlib.util

spec = importlib.util.spec_from_file_location('m', 'pdf-test/bulk_math_v5.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)

PROGRESS = '/workspace/edutunisie/pdf-test/fix_p7_progress.json'

# Load progress
done = {}
if os.path.exists(PROGRESS):
    with open(PROGRESS) as f: done = json.load(f)

# Get bad titles
print('Loading...', flush=True)
r = m.neon_query('''
SELECT id, "numericId", title FROM "Resource"
WHERE title !~ ' - ' AND LENGTH(title) > 10
''')
targets = [{'id': r[0], 'nid': r[1], 'title': str(r[2])} for r in r.get('response', [{}])[0].get('data', {}).get('rows', [])]
print(f'Total: {len(targets)}', flush=True)

def fix(t):
    # 1. Replace \xa0 with space
    t = t.replace('\xa0', ' ')
    # 2. Add space around `-` that doesn't have it (but not inside numbers)
    # Pattern: word-chars or digit then `-` then word-chars
    t = re.sub(r'([a-zA-Zà-ÿÀ-Ÿ0-9])-([a-zA-Zà-ÿÀ-Ÿ])', r'\1 - \2', t)
    # 3. Remove multiple spaces
    t = re.sub(r' +', ' ', t)
    return t.strip()

# Examples
print('\nExamples:')
for t in targets[:8]:
    new = fix(t['title'])
    if new != t['title']:
        print(f'  NID {t["nid"]}:')
        print(f'    OLD: {repr(t["title"])}')
        print(f'    NEW: {repr(new)}')

# Apply
ok = 0
fail = 0
no_change = 0
for i, t in enumerate(targets):
    nid_s = str(t['nid'])
    if done.get(nid_s) == 'ok':
        continue
    new = fix(t['title'])
    if new == t['title']:
        done[nid_s] = 'no_change'
        no_change += 1
        continue
    new_clean = new.replace("'", "''")
    sql = f"UPDATE \"Resource\" SET title = $${new_clean}$$ WHERE id = '{t['id']}'"
    try:
        m.neon_query(sql)
        done[nid_s] = 'ok'
        ok += 1
    except Exception as e:
        done[nid_s] = f'fail:{str(e)[:50]}'
        fail += 1
    if (i+1) % 25 == 0:
        print(f'[{i+1}/{len(targets)}] OK:{ok} FAIL:{fail} NOCHG:{no_change}', flush=True)
        with open(PROGRESS, 'w') as f: json.dump(done, f)

with open(PROGRESS, 'w') as f: json.dump(done, f)
print(f'\nDone: {ok} OK, {fail} fail, {no_change} no_change')
