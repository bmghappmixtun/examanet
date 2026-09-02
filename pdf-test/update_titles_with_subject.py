#!/usr/bin/env python3
"""Update Resource.title to append ': {generalSubject}' if not already present."""
import os, json, re, importlib.util, time

spec = importlib.util.spec_from_file_location('m', 'pdf-test/bulk_math_v5.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)

PROGRESS = '/workspace/edutunisie/pdf-test/update_titles_progress.json'
done = {}
if os.path.exists(PROGRESS):
    with open(PROGRESS) as f: done = json.load(f)

# Get all college resources with generalSubject
print('Loading...', flush=True)
r = m.neon_query('''
SELECT r.id, r."numericId", r.title, rm."generalSubject"
FROM "Resource" r
JOIN "Class" c ON c.id = r."classId"
LEFT JOIN "ResourceMetadata" rm ON rm."resourceId" = r.id
WHERE c.slug IN ('7eme', '8eme', '9eme')
  AND rm."generalSubject" IS NOT NULL
  AND rm."generalSubject" != ''
''')
targets = [{'id': r[0], 'nid': r[1], 'title': str(r[2]), 'subject': str(r[3])} 
           for r in r.get('response', [{}])[0].get('data', {}).get('rows', [])]
print(f'Total: {len(targets)}', flush=True)

def update_title(t):
    """Add ' : subject' to title if not already there."""
    old = t['title']
    subj = t['subject'].strip()
    
    # Skip if already has the subject
    if f' : {subj}' in old or f': {subj}' in old or old.endswith(subj):
        return None
    
    # If title already has ' : something', replace or add
    if ' : ' in old:
        # Has existing subject - keep it
        # Actually let's not modify, just append if different
        return None
    
    # Check for ' - ' separator pattern (from our previous title cleanup)
    # Don't break that pattern, just append
    new_title = f'{old} : {subj}'
    return new_title

# Apply
ok = 0
skip = 0
fail = 0
start = time.time()
for i, t in enumerate(targets):
    nid_s = str(t['nid'])
    if done.get(nid_s) == 'ok':
        skip += 1
        continue
    
    new = update_title(t)
    if not new:
        done[nid_s] = 'skip'
        skip += 1
        continue
    
    try:
        new_clean = re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]', '', new).replace("'", "''")
        m.neon_query(f"UPDATE \"Resource\" SET title = '{new_clean}' WHERE id = '{t['id']}'")
        done[nid_s] = 'ok'
        ok += 1
    except Exception as e:
        done[nid_s] = f'fail:{str(e)[:50]}'
        fail += 1
    
    if (i+1) % 100 == 0:
        elapsed = time.time() - start
        rate = (i+1) / elapsed if elapsed > 0 else 0
        print(f'[{i+1}/{len(targets)}] OK:{ok} FAIL:{fail} SKIP:{skip} ({rate:.0f}/s)', flush=True)
        with open(PROGRESS, 'w') as f: json.dump(done, f)

with open(PROGRESS, 'w') as f: json.dump(done, f)
print(f'\nDone: {ok} OK, {fail} FAIL, {skip} SKIP in {time.time()-start:.0f}s')
