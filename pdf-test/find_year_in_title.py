import sys
sys.path.insert(0, '/workspace/edutunisie/pdf-test')
import importlib.util
spec = importlib.util.spec_from_file_location('bulk_math_v5', '/workspace/edutunisie/pdf-test/bulk_math_v5.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
import re

# Find all DEVOIR/EXERCISE/COURSE without year but with year in title
r = m.neon_query('''
SELECT id, "numericId", title, type
FROM "Resource"
WHERE (year IS NULL OR year = '') 
  AND title ~ '\\(\\d{4}-\\d{4}\\)'
''')
rows = r.get('response', [{}])[0].get('data', {}).get('rows', [])
print(f'Found: {len(rows)} with year in title but DB year empty')

# Sample
for rid, nid, title, type_ in rows[:15]:
    m2 = re.search(r'\((\d{4}-\d{4})\)', title)
    if m2:
        print(f'  NID {nid} [{type_}]: title_year={m2.group(1)} | {title[:60]}')
