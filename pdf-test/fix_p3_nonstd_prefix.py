#!/usr/bin/env python3
"""P3: Strip non-standard prefixes (AR/Correction/Travaux) from 521 titles.
"""
import os, json, re, importlib.util

spec = importlib.util.spec_from_file_location('m', 'pdf-test/bulk_math_v5.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)

PROGRESS = '/workspace/edutunisie/pdf-test/fix_p3_progress.json'

# AR patterns
AR_PREFIXES = [
    r'^تصحيح\s*[،,:]?\s*',
    r'^تربية\s*[إ]?سلامية\s*[،,:]?\s*',
    r'^مراقبة\s*[،,:]?\s*',
    r'^فرض\s*[،,:]?\s*',
    r'^سلسلة\s*[،,:]?\s*',
    r'^دورة\s*[،,:]?\s*',
    r'^تطبيق\s*[،,:]?\s*',
    r'^درس\s*[،,:]?\s*',
]
# FR patterns
FR_PREFIXES = [
    r'^Travaux\s+(pratiques?|dirigés?)?\s*[:\-]?\s*',
    r'^Correction\s*[:\-]?\s*',
    r'^Corrigé\s*[:\-]?\s*',
    r'^Amended\s*[:\-]?\s*',
    r'^\(\s*amended\s*\)\s*[:\-]?\s*',
    r'^DC\s+N°\s*\d+\s*[:\-]?\s*',
    r'^DS\s+N°\s*\d+\s*[:\-]?\s*',
]

def strip_prefix(title):
    """Strip AR/FR non-standard prefixes from title."""
    new_title = title.strip()
    
    # Apply AR patterns (multiple times)
    for _ in range(3):
        changed = new_title
        for pat in AR_PREFIXES:
            new_title = re.sub(pat, '', new_title, flags=re.IGNORECASE).strip()
        if changed == new_title:
            break
    
    # Apply FR patterns
    for _ in range(3):
        changed = new_title
        for pat in FR_PREFIXES:
            new_title = re.sub(pat, '', new_title, flags=re.IGNORECASE).strip()
        if changed == new_title:
            break
    
    return new_title

# Load progress
done = {}
if os.path.exists(PROGRESS):
    with open(PROGRESS) as f: done = json.load(f)

# Get 521 with non-standard prefixes
print('Loading...', flush=True)
r = m.neon_query("SELECT id, \"numericId\", title FROM \"Resource\" WHERE title ~* 'تصحيح|تربية|مراقبة|فرض|سلسلة|دورة|تطبيق|درس|Travaux|Correction|Corrigé|amended'")
targets = [{'id': r[0], 'nid': r[1], 'title': r[2]} for r in r.get('response', [{}])[0].get('data', {}).get('rows', [])]
print(f'Total: {len(targets)}', flush=True)

# Show examples
print('\nExamples (before/after):')
for t in targets[:15]:
    new = strip_prefix(t['title'])
    if new != t['title']:
        print(f'  NID {t["nid"]}: "{t["title"][:50]}" → "{new[:50]}"')

# Apply
ok = 0
fail = 0
no_change = 0
for i, t in enumerate(targets):
    nid_s = str(t['nid'])
    if done.get(nid_s) == 'ok':
        continue
    new_title = strip_prefix(t['title'])
    if new_title == t['title']:
        done[nid_s] = 'no_change'
        no_change += 1
        continue
    new_clean = re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]', '', new_title).replace("'", "''")
    sql = f"UPDATE \"Resource\" SET title = $${new_clean}$$ WHERE id = '{t['id']}'"
    try:
        m.neon_query(sql)
        done[nid_s] = 'ok'
        ok += 1
    except Exception as e:
        done[nid_s] = f'fail:{str(e)[:50]}'
        fail += 1
    if (i+1) % 50 == 0:
        print(f'[{i+1}/{len(targets)}] OK:{ok} FAIL:{fail} NC:{no_change}', flush=True)
        with open(PROGRESS, 'w') as f: json.dump(done, f)

with open(PROGRESS, 'w') as f: json.dump(done, f)
print(f'\nDone: {ok} OK, {fail} fail, {no_change} no_change')
