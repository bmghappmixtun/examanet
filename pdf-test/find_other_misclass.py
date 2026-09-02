import sys
sys.path.insert(0, '/workspace/edutunisie/pdf-test')
import importlib.util
spec = importlib.util.spec_from_file_location('bulk_math_v5', '/workspace/edutunisie/pdf-test/bulk_math_v5.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
import re

# Find OTHER type resources that have Arabic devoir/exam/serie markers
r = m.neon_query('''
SELECT id, "numericId", title, type
FROM "Resource"
WHERE type = 'OTHER' AND (
  title ~* 'فرض'  -- Arabic for "devoir"
  OR title ~* 'اختبار'  -- Arabic for "test/exam"
  OR title ~* 'سلسلة'  -- Arabic for "series"
  OR title ~* 'Devoir|Contrôle|Synthèse|Serie|Test|Examen'  -- French
)
''')
rows = r.get('response', [{}])[0].get('data', {}).get('rows', [])
print(f'Found: {len(rows)} OTHER with devoir/exam/serie markers')

for rid, nid, title, type_ in rows[:20]:
    print(f'  NID {nid}: {title[:80]}')
