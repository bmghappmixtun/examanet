#!/usr/bin/env python3
"""Remove '(المصدر الأصلي)' (original source indicator) from all titles.
Was added by previous translation as an indicator for files we couldn't verify the source.
"""
import os, json, re, importlib.util

spec = importlib.util.spec_from_file_location('m', 'pdf-test/bulk_math_v5.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)

# Get all titles with (المصدر الأصلي)
r = m.neon_query('''SELECT id, "numericId", title FROM "Resource" 
                    WHERE title LIKE '%(المصدر الأصلي)%' ''')
targets = []
for row in r.get('response', [{}])[0].get('data', {}).get('rows', []):
    targets.append({'id': row[0], 'nid': row[1], 'title': str(row[2])})

print(f'Total: {len(targets)}')

# Patterns to clean
# 1. ' - (المصدر الأصلي)' → ' '
# 2. ' (المصدر الأصلي)' (before colon or end) → ''
# 3. '(المصدر الأصلي) : sujet' → ': sujet'
# 4. ' (المصدر الأصلي) :' → ' :' (with leading space)

def clean_title(t):
    title = t['title']
    new = title
    
    # Replace ' - (المصدر الأصلي) :' with ' :'
    new = re.sub(r'\s*-\s*\(المصدر الأصلي\)\s*:\s*', ' : ', new)
    # Replace ' - (المصدر الأصلي) -' with ' -'
    new = re.sub(r'\s*-\s*\(المصدر الأصلي\)\s*-\s*', ' - ', new)
    # Replace ' - (المصدر الأصلي)' at end with ''
    new = re.sub(r'\s*-\s*\(المصدر الأصلي\)\s*$', '', new)
    # Replace ' (المصدر الأصلي)' at end (no dash) with ''
    new = re.sub(r'\s*\(المصدر الأصلي\)\s*$', '', new)
    # Replace ' (المصدر الأصلي) :' with ' :'
    new = re.sub(r'\s*\(المصدر الأصلي\)\s*:\s*', ' : ', new)
    # Replace '(المصدر الأصلي) ' (alone) with ''
    new = re.sub(r'\s*\(المصدر الأصلي\)\s*', ' ', new)
    
    # Clean up trailing ' - ' or extra spaces
    new = re.sub(r'\s+', ' ', new).strip()
    new = re.sub(r'\s+-\s*$', '', new)
    new = re.sub(r'^\s*-\s+', '', new)
    # Multiple spaces around :
    new = re.sub(r'\s*:\s*', ' : ', new)
    new = re.sub(r'\s+', ' ', new).strip()
    
    return new if new != title else None

ok = 0
skip = 0
no_change = 0
for t in targets:
    new_title = clean_title(t)
    if not new_title:
        no_change += 1
        continue
    if new_title == t['title']:
        no_change += 1
        continue
    
    new_clean = re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]', '', new_title).replace("'", "''")
    m.neon_query(f"UPDATE \"Resource\" SET title = '{new_clean}' WHERE id = '{t['id']}'")
    ok += 1
    
    if ok <= 5:
        print(f'  NID {t["nid"]}: {t["title"]}')
        print(f'    → {new_title}')

print(f'\nDone: {ok} updated, {no_change} no change')
