#!/usr/bin/env python3
"""P4: Add year from DB to title for 1,433 resources.
"""
import os, json, re, importlib.util

spec = importlib.util.spec_from_file_location('m', 'pdf-test/bulk_math_v5.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)

PROGRESS = '/workspace/edutunisie/pdf-test/fix_p4_progress.json'

# Load progress
done = {}
if os.path.exists(PROGRESS):
    with open(PROGRESS) as f: done = json.load(f)

# Get titles without year
print('Loading...', flush=True)
r = m.neon_query('''
SELECT id, "numericId", title, year
FROM "Resource"
WHERE year IS NOT NULL AND year != ''
  AND title !~ '\([0-9]{4}-[0-9]{4}\)'
  AND title !~ '\([0-9]{4}\)'  -- not partial year either
''')
targets = [{'id': r[0], 'nid': r[1], 'title': str(r[2]), 'year': r[3]} for r in r.get('response', [{}])[0].get('data', {}).get('rows', [])]
print(f'Total: {len(targets)}', flush=True)

# Examples
print('\nExamples:')
for t in targets[:10]:
    new = t['title'].rstrip() + f" ({t['year']})"
    print(f'  NID {t["nid"]}: "{t["title"][:60]}" → "{new[:80]}"')

# Apply
ok = 0
fail = 0
for i, t in enumerate(targets):
    nid_s = str(t['nid'])
    if done.get(nid_s) == 'ok':
        continue
    new_title = t['title'].rstrip() + f" ({t['year']})"
    new_clean = re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]', '', new_title).replace("'", "''")
    sql = f"UPDATE \"Resource\" SET title = $${new_clean}$$ WHERE id = '{t['id']}'"
    try:
        m.neon_query(sql)
        done[nid_s] = 'ok'
        ok += 1
    except Exception as e:
        done[nid_s] = f'fail:{str(e)[:50]}'
        fail += 1
    if (i+1) % 100 == 0:
        print(f'[{i+1}/{len(targets)}] OK:{ok} FAIL:{fail}', flush=True)
        with open(PROGRESS, 'w') as f: json.dump(done, f)

with open(PROGRESS, 'w') as f: json.dump(done, f)
print(f'\nDone: {ok} OK, {fail} fail')
