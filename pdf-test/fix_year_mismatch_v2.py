"""Continue fixing year mismatches with multi-row UPDATE"""
import sys
sys.path.insert(0, '/workspace/edutunisie/pdf-test')
import importlib.util
spec = importlib.util.spec_from_file_location('bulk_math_v5', '/workspace/edutunisie/pdf-test/bulk_math_v5.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
import re

# Get all remaining mismatches
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
        mismatches.append((rid, m2.group(1)))

print(f'Remaining: {len(mismatches)}')

# Use bulk UPDATE with VALUES
BATCH = 200
fixed = 0
for i in range(0, len(mismatches), BATCH):
    batch = mismatches[i:i+BATCH]
    values = ','.join(f"('{rid}', '{year}')" for rid, year in batch)
    sql = f'''
    UPDATE "Resource" r SET year = v.year
    FROM (VALUES {values}) AS v(id, year)
    WHERE r.id = v.id
    '''
    try:
        m.neon_query(sql)
        fixed += len(batch)
    except Exception as e:
        print(f'  Error at {i}: {e}')
    
    if (i+BATCH) % 500 == 0 or (i+BATCH) >= len(mismatches):
        print(f'  Progress: {min(i+BATCH, len(mismatches))}/{len(mismatches)}')

print(f'✓ Fixed {fixed}')
