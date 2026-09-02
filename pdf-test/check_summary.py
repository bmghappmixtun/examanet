import sys
sys.path.insert(0, '/workspace/edutunisie/pdf-test')
import importlib.util
spec = importlib.util.spec_from_file_location('bulk_math_v5', '/workspace/edutunisie/pdf-test/bulk_math_v5.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)

# All SUMMARY resources
r = m.neon_query('''
SELECT "numericId", title, "homeworkSubtype", "homeworkNumber", year
FROM "Resource"
WHERE type = 'SUMMARY'
ORDER BY "numericId"
''')
rows = r.get('response', [{}])[0].get('data', {}).get('rows', [])
print(f'Total SUMMARY: {len(rows)}')
for row in rows:
    print(f'  NID {row[0]}: sub={row[2]!r}, hwn={row[3]}, year={row[4]} | {row[1][:80]}')
