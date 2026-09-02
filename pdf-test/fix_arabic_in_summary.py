import sys
sys.path.insert(0, '/workspace/edutunisie/pdf-test')
import importlib.util
spec = importlib.util.spec_from_file_location('bulk_math_v5', '/workspace/edutunisie/pdf-test/bulk_math_v5.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
import re

# Find Arabic "تمارين مراجعة" → EXERCISE
r = m.neon_query('''
SELECT id, "numericId", title FROM "Resource"
WHERE type = 'SUMMARY' AND title LIKE 'تمارين مراجعة%'
''')
rows = r.get('response', [{}])[0].get('data', {}).get('rows', [])
print(f'تمارين مراجعة (revision exercises): {len(rows)}')
ids = [r[0] for r in rows]
if ids:
    ids_str = "','".join(ids)
    m.neon_query(f"UPDATE \"Resource\" SET type = 'EXERCISE' WHERE id IN ('{ids_str}')")
    for r in rows:
        print(f'  NID {r[1]}: {r[2][:80]} → EXERCISE')

# Find Arabic "فرض مراجعة" → DEVOIR/CONTROLE
r = m.neon_query('''
SELECT id, "numericId", title FROM "Resource"
WHERE type = 'SUMMARY' AND title LIKE 'فرض مراجعة%'
''')
rows = r.get('response', [{}])[0].get('data', {}).get('rows', [])
print(f'\nفرض مراجعة (revision devoir): {len(rows)}')
ids = [r[0] for r in rows]
if ids:
    ids_str = "','".join(ids)
    m.neon_query(f"UPDATE \"Resource\" SET type = 'DEVOIR', \"homeworkSubtype\" = 'CONTROLE' WHERE id IN ('{ids_str}')")
    for r in rows:
        print(f'  NID {r[1]}: {r[2][:80]} → DEVOIR/CONTROLE')

# Also "مراجعة" alone (1 case)
r = m.neon_query('''
SELECT id, "numericId", title FROM "Resource"
WHERE type = 'SUMMARY' AND title LIKE 'مراجعة%' AND title NOT LIKE 'تمارين مراجعة%' AND title NOT LIKE 'فرض مراجعة%'
''')
rows = r.get('response', [{}])[0].get('data', {}).get('rows', [])
print(f'\nمراجعة (revision alone): {len(rows)}')
ids = [r[0] for r in rows]
if ids:
    ids_str = "','".join(ids)
    m.neon_query(f"UPDATE \"Resource\" SET type = 'EXERCISE' WHERE id IN ('{ids_str}')")
    for r in rows:
        print(f'  NID {r[1]}: {r[2][:80]} → EXERCISE')

# Also "ملخص" - is it summary? Yes - leave as SUMMARY
# But check if it has wrong subtype
r = m.neon_query('''
SELECT id, "numericId", title, "homeworkSubtype", "homeworkNumber"
FROM "Resource"
WHERE type = 'SUMMARY' AND title LIKE 'ملخص%'
''')
rows = r.get('response', [{}])[0].get('data', {}).get('rows', [])
print(f'\nملخص (Arabic summary): {len(rows)}')
for row in rows:
    print(f'  NID {row[1]}: {row[2][:80]}, sub={row[3]}, hwn={row[4]}')

# Final state
print()
print("=" * 60)
print("FINAL SUMMARY STATE")
print("=" * 60)
r = m.neon_query('''
SELECT 
  CASE
    WHEN title LIKE 'Résumé%' THEN 'Résumé - X'
    WHEN title LIKE 'ملخص%' THEN 'ملخص (Arabic summary)'
    WHEN title LIKE 'مراجعة%' OR title LIKE 'تمارين مراجعة%' OR title LIKE 'فرض مراجعة%' THEN 'مراجعة (Arabic revision)'
    WHEN title LIKE 'Cours%' THEN 'Cours (should not be here)'
    WHEN title LIKE 'Devoir%' THEN 'Devoir (should not be here)'
    ELSE 'Other'
  END as prefix,
  COUNT(*) as cnt
FROM "Resource"
WHERE type = 'SUMMARY'
GROUP BY prefix
ORDER BY cnt DESC
''')
for row in r.get('response', [{}])[0].get('data', {}).get('rows', []):
    print(f'  {row[0]}: {row[1]}')

r = m.neon_query('SELECT COUNT(*) FROM "Resource" WHERE type = \'SUMMARY\'')
total = r.get('response', [{}])[0].get('data', {}).get('rows', [])[0][0]
print(f'\nTotal SUMMARY: {total}')
