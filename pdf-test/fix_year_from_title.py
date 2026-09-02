import sys
sys.path.insert(0, '/workspace/edutunisie/pdf-test')
import importlib.util
spec = importlib.util.spec_from_file_location('bulk_math_v5', '/workspace/edutunisie/pdf-test/bulk_math_v5.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
import re

r = m.neon_query('''
SELECT id, "numericId", title
FROM "Resource"
WHERE (year IS NULL OR year = '') 
  AND title ~ '\\(\\d{4}-\\d{4}\\)'
''')
rows = r.get('response', [{}])[0].get('data', {}).get('rows', [])

# Build multi-row UPDATE
updates = []
for rid, nid, title in rows:
    m2 = re.search(r'\((\d{4}-\d{4})\)', title)
    if m2:
        updates.append((rid, m2.group(1)))

print(f'Fixing {len(updates)} resources')

# Batch
BATCH = 50
for i in range(0, len(updates), BATCH):
    batch = updates[i:i+BATCH]
    values = ','.join(f"('{rid}', '{year}')" for rid, year in batch)
    m.neon_query(f"UPDATE \"Resource\" r SET year = v.year FROM (VALUES {values}) AS v(id, year) WHERE r.id = v.id")

print(f'✓ Done')
