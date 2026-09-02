import sys
sys.path.insert(0, '/workspace/edutunisie/pdf-test')
import importlib.util
spec = importlib.util.spec_from_file_location('bulk_math_v5', '/workspace/edutunisie/pdf-test/bulk_math_v5.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)

# Total COURSE resources
r = m.neon_query('SELECT COUNT(*) FROM "Resource" WHERE type = \'COURSE\'')
total = r.get('response', [{}])[0].get('data', {}).get('rows', [])[0][0]
print(f'Total COURSE: {total}')

# COURSE with various title patterns
print("\n=== COURSE title prefix distribution ===")
r = m.neon_query('''
SELECT 
  CASE
    WHEN title LIKE 'الدّرس%' OR title LIKE 'درس%' THEN 'الدّرس (Lesson)'
    WHEN title LIKE 'Cours%' THEN 'Cours'
    WHEN title LIKE 'Leçon%' THEN 'Leçon'
    WHEN title LIKE 'Résumé%' THEN 'Résumé'
    WHEN title LIKE 'N°%' THEN 'N°X (should be DEVOIR)'
    WHEN title LIKE 'Série%' THEN 'Série (should be EXERCISE)'
    WHEN title LIKE 'Devoir%' THEN 'Devoir (should be DEVOIR)'
    WHEN title LIKE 'Document%' THEN 'Document'
    WHEN title LIKE 'سلسلة%' THEN 'سلسلة (should be EXERCISE)'
    WHEN title LIKE 'فرض%' THEN 'فرض (should be DEVOIR)'
    ELSE 'Other (topic-only)'
  END as prefix,
  COUNT(*) as cnt
FROM "Resource"
WHERE type = 'COURSE'
GROUP BY prefix
ORDER BY cnt DESC
''')
for row in r.get('response', [{}])[0].get('data', {}).get('rows', []):
    print(f'  {row[0]}: {row[1]}')
