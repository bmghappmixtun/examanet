"""Fix year mismatches: trust title year over DB year (DB is upload year, not document year)"""
import sys
sys.path.insert(0, '/workspace/edutunisie/pdf-test')
import importlib.util
spec = importlib.util.spec_from_file_location('bulk_math_v5', '/workspace/edutunisie/pdf-test/bulk_math_v5.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
import re

# Get all mismatches
r = m.neon_query('''
SELECT id, "numericId", title, year
FROM "Resource"
WHERE year IS NOT NULL AND year != '' AND title ~ '\\(\\d{4}-\\d{4}\\)'
''')
rows = r.get('response', [{}])[0].get('data', {}).get('rows', [])

mismatches = []
for row in rows:
    rid, nid, title, db_year = row
    m2 = re.search(r'\((\d{4}-\d{4})\)', title)
    if m2 and m2.group(1) != db_year:
        mismatches.append((rid, nid, title, db_year, m2.group(1)))

print(f'Total mismatches to fix: {len(mismatches)}')

# Process in batches
BATCH = 50
fixed = 0
for i in range(0, len(mismatches), BATCH):
    batch = mismatches[i:i+BATCH]
    
    # Build batched backup + update
    for rid, nid, title, db_year, title_year in batch:
        try:
            m.neon_query(f"UPDATE \"Resource\" SET year = '{title_year}' WHERE id = '{rid}'")
            fixed += 1
        except Exception as e:
            print(f'  Error for NID {nid}: {e}')
    
    if (i+BATCH) % 200 == 0 or (i+BATCH) >= len(mismatches):
        print(f'  Progress: {min(i+BATCH, len(mismatches))}/{len(mismatches)}')

print(f'✓ Fixed {fixed} resources')
