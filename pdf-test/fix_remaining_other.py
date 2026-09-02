import sys
sys.path.insert(0, '/workspace/edutunisie/pdf-test')
import importlib.util
spec = importlib.util.spec_from_file_location('bulk_math_v5', '/workspace/edutunisie/pdf-test/bulk_math_v5.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)

# These are Arabic course content - all 58 should be COURSE
r = m.neon_query('''
SELECT id FROM "Resource" WHERE type = 'OTHER'
''')
rows = r.get('response', [{}])[0].get('data', {}).get('rows', [])
ids = [row[0] for row in rows]
print(f'Reclassifying {len(ids)} OTHER → COURSE')

BATCH = 100
for i in range(0, len(ids), BATCH):
    batch = ids[i:i+BATCH]
    ids_str = "','".join(batch)
    m.neon_query(f"UPDATE \"Resource\" SET type = 'COURSE' WHERE id IN ('{ids_str}')")

# Final state
r = m.neon_query('SELECT type, COUNT(*) FROM "Resource" GROUP BY type ORDER BY COUNT(*) DESC')
print('\nFinal distribution:')
for row in r.get('response', [{}])[0].get('data', {}).get('rows', []):
    print(f'  {row[0]}: {row[1]}')
